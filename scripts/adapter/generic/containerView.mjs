/**
 * GenericInteractiveContainerView — ApplicationV2 sheet shown when a player
 * (or GM) opens a container-mode generic interactive actor token.
 *
 * Renders the contents list from `flags["pick-up-stix"].interactive.contents[]`
 * with per-row controls. Handles Item and interactive-Actor drops onto the
 * contents list, appending an `{id, name, img, description, quantity}` record.
 * Row dragstart emits a synthetic `"InteractiveContent"` payload for Phase 7
 * to wire to canvas placement.
 *
 * Non-GM viewers see a placeholder ("contents hidden") when the container is
 * closed/locked or they're out of interaction range — same UX as dnd5e/pf2e
 * container views but evaluated inline rather than via a hook decorator.
 *
 * Per-actor singleton cached in `#instances`; cleaned up in `close()`.
 */

import { getAdapter } from "../index.mjs";
import { checkProximity, pickupItem, depositItem, setContainerOpen, toggleContainerLocked } from "../../transfer/ItemTransfer.mjs";
import { isModuleGM, isPlayerView } from "../../utils/playerView.mjs";
import { validateContainerAccess } from "../../utils/containerAccess.mjs";
import { resolvePickupTarget } from "../../utils/pickupFlow.mjs";
import { dispatchGM } from "../../utils/gmDispatch.mjs";
import { promptItemQuantity } from "../../utils/quantityPrompt.mjs";
import { createStateToggleButton } from "../../utils/domButtons.mjs";
import { dbg } from "../../utils/debugLog.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const ActorSheetV2 = foundry.applications.sheets.ActorSheetV2;

/**
 * Container view sheet for generic-mode interactive actors in container mode.
 * Shown to players and GMs when the token is clicked.
 */
export default class GenericInteractiveContainerView
  extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** Per-actor singleton cache so repeat opens reuse the existing window. */
  static #instances = new Map();

  /**
   * Resolve the container view sheet for a given actor, creating one on first
   * call and returning the cached instance on subsequent calls.
   *
   * @param {Actor} actor
   * @returns {GenericInteractiveContainerView}
   */
  static forActor(actor) {
    const key = actor.uuid;
    let sheet = GenericInteractiveContainerView.#instances.get(key);
    if (!sheet) {
      dbg("generic-container-view:forActor", "creating new instance", { actorName: actor.name });
      sheet = new GenericInteractiveContainerView({ document: actor });
      GenericInteractiveContainerView.#instances.set(key, sheet);
    }
    return sheet;
  }

  static DEFAULT_OPTIONS = {
    classes: ["pick-up-stix", "generic-container-view", "sheet"],
    position: { width: 420, height: "auto" },
    window: { resizable: true },
    // Drag-and-drop is wired entirely via explicit addEventListener in
    // _onRender (both dragstart on rows and drop on the whole window).
    // The V2 DragDrop framework's bind/re-bind timing turned out flaky
    // here: the first drop after a render sometimes silently no-oped
    // because the listener wasn't re-attached on the post-render DOM in
    // the same tick the drop fired. Explicit listeners in _onRender run
    // synchronously after every render and don't miss.
    actions: {
      deleteContent: GenericInteractiveContainerView.#onDeleteContent
    }
  };

  static PARTS = {
    body: { template: "modules/pick-up-stix/templates/container-view-generic.hbs" }
  };

  get title() {
    return getAdapter().getInteractiveDisplayName(this.actor);
  }

  /**
   * Build template context from the actor's interactive flag blob.
   * Evaluates the contents-visibility gate inline: non-GM viewers see a
   * placeholder when the container is closed/locked or they're out of
   * interaction range.
   *
   * @param {object} options
   * @returns {Promise<object>}
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const adapter = getAdapter();
    const data = adapter.getInteractiveData(this.actor);

    dbg("generic-container-view:_prepareContext", {
      actorName: this.actor?.name,
      isOpen: data.isOpen,
      isLocked: data.isLocked,
      contentsCount: (data.contents ?? []).length
    });

    context.name = data.name || this.actor.name;

    // Swap to the open image when the container is open and one is configured.
    context.img = (data.isOpen && data.openImage)
      ? data.openImage
      : (data.img || this.actor.img);

    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      data.description ?? "", { async: true }
    );

    context.isGM = game.user.isGM;
    // The pickup hand button is only meaningful when the source container
    // is a placed token (synthetic actor) — picking up from the sidebar
    // template doesn't correspond to anything in the world.
    context.isTokenActor = !!this.actor.token;

    context.contents = (data.contents ?? []).map(c => ({
      ...c,
      showQuantity: (c.quantity ?? 1) > 1
    }));

    // Contents-visibility gate — same logic as the dnd5e/pf2e contents-hide
    // decorators, but evaluated inline since this sheet owns its own rendering.
    const closedOrLocked = !data.isOpen || data.isLocked;
    const inRange = checkProximity(this.actor, { silent: true, range: "interaction" });

    if (!isModuleGM() && (closedOrLocked || !inRange)) {
      dbg("generic-container-view:_prepareContext", "hiding contents", { closedOrLocked, inRange });
      context.showContents = false;
      context.hiddenMessage = closedOrLocked
        ? game.i18n.localize("INTERACTIVE_ITEMS.Notify.ContainerClosed")
        : game.i18n.localize("INTERACTIVE_ITEMS.Container.ContentsHidden");
    } else {
      context.showContents = true;
    }

    return context;
  }

  /**
   * Attach per-row listeners on every render. V2 re-runs _onRender on each
   * repaint so listeners are always fresh. We wire dragstart and the pickup
   * click handler here rather than via the V2 DragDrop framework so the
   * payload reliably reaches the canvas drop handler and the pickup target
   * resolution happens with up-to-date state.
   *
   * @param {object} context
   * @param {object} options
   */
  _onRender(context, options) {
    super._onRender(context, options);

    // Attach drop/dragover on the template-root section rather than
    // this.element. V2 re-uses this.element across renders so addEventListener
    // would stack — the drop would fire N times after N renders, re-opening
    // the quantity prompt for every accumulated listener. The section is
    // part of the rendered template content, which V2 replaces each render,
    // so old listeners are garbage-collected with the old DOM. Covers the
    // whole sheet body: header, description, contents list.
    const dropTarget = this.element?.querySelector(".generic-container-view");
    if (dropTarget) {
      dropTarget.addEventListener("dragover", (event) => event.preventDefault());
      dropTarget.addEventListener("drop", (event) => this.#onDropOntoContents(event));
    }

    // GM-only window-header toggles (Open/Close, Lock, Configure). The
    // window-header IS preserved across renders, so guard against duplicate
    // injection by removing any prior toggles first inside #injectHeaderToggles.
    if (game.user.isGM) {
      const header = this.element?.querySelector(".window-header");
      if (header) this.#injectHeaderToggles(header);
    }

    if (!context.showContents) return;

    this.element.querySelectorAll(".ii-contents-row").forEach(row => {
      row.addEventListener("dragstart", (event) => this.#onRowDragStart(event, row));
    });

    this.element.querySelectorAll(".ii-pickup-btn").forEach(btn => {
      btn.addEventListener("click", (event) => this.#onPickupClick(event, btn));
    });
  }

  /**
   * Inject Open/Close + Lock + Configure window-header toggles. Matches the
   * dnd5e/pf2e shared decorator's order. Identify is intentionally omitted
   * (generic mode has supportsIdentification:false).
   */
  #injectHeaderToggles(header) {
    header.querySelectorAll(".ii-containerview-toggle").forEach(el => el.remove());

    const adapter = getAdapter();
    const isOpen = adapter.isInteractiveOpen(this.actor);
    const isLocked = adapter.isInteractiveLocked(this.actor);
    const actor = this.actor;
    const buttons = [];

    buttons.push(createStateToggleButton({
      extraClass: "ii-containerview-toggle",
      active: isOpen,
      iconOn: "fa-box-open",
      iconOff: "fa-box",
      labelOnKey: "INTERACTIVE_ITEMS.Sheet.StateOpened",
      labelOffKey: "INTERACTIVE_ITEMS.Sheet.StateClosed",
      onClick: async (ev) => {
        ev.preventDefault();
        await setContainerOpen(actor, !adapter.isInteractiveOpen(actor));
      }
    }));

    buttons.push(createStateToggleButton({
      extraClass: "ii-containerview-toggle",
      active: isLocked,
      iconOn: "fa-lock",
      iconOff: "fa-lock-open",
      labelOnKey: "INTERACTIVE_ITEMS.Sheet.StateLocked",
      labelOffKey: "INTERACTIVE_ITEMS.Sheet.StateUnlocked",
      onClick: (ev) => {
        ev.preventDefault();
        toggleContainerLocked(actor);
      }
    }));

    buttons.push(createStateToggleButton({
      extraClass: "ii-containerview-toggle",
      active: true,
      iconOn: "fa-gear",
      iconOff: "fa-gear",
      labelOnKey: "INTERACTIVE_ITEMS.Sheet.ConfigureHUD",
      labelOffKey: "INTERACTIVE_ITEMS.Sheet.ConfigureHUD",
      onClick: async (ev) => {
        ev.preventDefault();
        await this.close();
        actor.sheet.renderConfig();
      }
    }));

    const title = header.querySelector(".window-title");
    if (title) title.after(...buttons);
    else header.prepend(...buttons);
  }

  /**
   * Handle a drag-and-drop onto the sheet. Accepts:
   * - `type: "Item"` — a sidebar / compendium / actor item.
   * - `type: "Actor"` — an item-mode interactive actor (generic).
   *
   * Extracts `{name, img, description, quantity}` from the dragged object and
   * appends a new content record (with a fresh random id) to `contents[]`.
   * Drop is gated on container state (proximity for players, closed/locked
   * for everyone) via validateContainerAccess.
   *
   * Wired explicitly in _onRender via addEventListener on `this.element`.
   *
   * @param {DragEvent} event
   */
  async #onDropOntoContents(event) {
    event.preventDefault();
    const adapter = getAdapter();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    dbg("generic-container-view:onDrop", { type: data?.type, uuid: data?.uuid });

    // Player-view drops are gated on proximity + open + unlocked, matching
    // the dnd5e/pf2e _gateContainerDrop flow. GM (with override) bypasses.
    if (isPlayerView()) {
      if (!validateContainerAccess(this.actor, { checkProximity: true })) {
        dbg("generic-container-view:onDrop", "player gate failed, bail");
        return;
      }
    } else {
      // GM with override on: still surface a closed-container warning so
      // they aren't confused by silent acceptance into a closed container.
      // Lock state is always enforced (notification, not block).
      if (!validateContainerAccess(this.actor, { checkProximity: false })) {
        dbg("generic-container-view:onDrop", "GM gate failed, bail");
        return;
      }
    }

    let payload = null;

    if (data?.type === "Item") {
      const item = await fromUuid(data.uuid);
      if (!item) {
        dbg("generic-container-view:onDrop", "item not found", { uuid: data.uuid });
        return;
      }

      // Partial-stack prompt for inventory-source items with qty > 1.
      // World items skip — they're created at the dragged quantity and have
      // no source to decrement.
      const sourceQty = adapter.getItemQuantity(item);
      let chosenQty = null;
      if (item.actor && sourceQty > 1) {
        chosenQty = await promptItemQuantity({
          itemName: item.name,
          max: sourceQty,
          actionKey: "INTERACTIVE_ITEMS.Dialog.QuantityActionDeposit",
          actionFormatArgs: { target: this.actor.name }
        });
        if (chosenQty == null) {
          dbg("generic-container-view:onDrop", "deposit quantity dialog cancelled, bail");
          return;
        }
      }

      // Inventory-source items: route through the depositItem socket so the
      // GM-side handler writes the contents row AND decrements the source.
      // Otherwise the source item leaks (it stays in the player's inventory
      // even though a copy now exists in the container).
      if (item.actor) {
        const tokenDoc = this.actor.token;
        if (!tokenDoc) {
          // Container is being viewed via sidebar template — can't route
          // through the socket (needs sceneId/tokenId). Direct write below
          // can't decrement the source either, so bail with a notice.
          dbg("generic-container-view:onDrop", "no token on container actor, can't route inventory deposit");
          ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.TransferError"));
          return;
        }
        const sceneId = tokenDoc.parent.id;
        const tokenId = tokenDoc.id;
        const moveQty = chosenQty ?? sourceQty;
        dbg("generic-container-view:onDrop", "inventory-source: dispatching depositItem", { sourceActorId: item.actor.id, moveQty });
        await dispatchGM(
          "depositItem",
          { sourceActorId: item.actor.id, itemId: item.id, sceneId, tokenId, quantity: moveQty },
          async () => depositItem(item.actor.id, item.id, sceneId, tokenId, moveQty)
        );
        return;
      }

      // World item (no source actor): direct flag write at the dragged quantity.
      payload = {
        id: foundry.utils.randomID(),
        name: item.name,
        img: item.img,
        // Both `system.description.value` (dnd5e/pf2e) and `system.description`
        // (many generic systems) are checked; missing = empty string.
        description: item.system?.description?.value ?? item.system?.description ?? "",
        quantity: sourceQty
      };
    } else if (data?.type === "Actor") {
      // Only accept item-mode generic interactive actors so GMs can
      // deposit placed items directly into a container by dragging.
      const droppedActor = await fromUuid(data.uuid);
      if (!droppedActor) {
        dbg("generic-container-view:onDrop", "actor not found", { uuid: data.uuid });
        return;
      }
      const droppedData = adapter.getInteractiveData(droppedActor);
      if (droppedData.mode !== "item" || !droppedData.itemData) {
        dbg("generic-container-view:onDrop", "actor is not an item-mode interactive with itemData — skipping", {
          mode: droppedData.mode, hasItemData: !!droppedData.itemData
        });
        return;
      }
      // Prefer top-level interactive fields — those reflect the GM's
      // current edits via the config sheet. itemData is the snapshot at
      // drop time and goes stale after any rename / image change.
      payload = {
        id: foundry.utils.randomID(),
        name: droppedData.name || droppedData.itemData?.name || droppedActor.name,
        img: droppedData.img || droppedData.itemData?.img || droppedActor.img,
        description: droppedData.description || droppedData.itemData?.description || "",
        quantity: droppedData.itemData?.quantity ?? 1
      };
    }

    if (!payload) {
      dbg("generic-container-view:onDrop", "unhandled drag type, skipping", { type: data?.type });
      return;
    }

    dbg("generic-container-view:onDrop", "appending content row", { name: payload.name, qty: payload.quantity });
    const current = adapter.getInteractiveData(this.actor);
    const next = [...(current.contents ?? []), payload];
    await adapter.setInteractiveData(this.actor, { contents: next });
    this.render();
  }

  /**
   * Emit a synthetic `"InteractiveContent"` drag payload when the user
   * starts dragging a content row. Wired explicitly in `_onRender` rather
   * than through V2's DragDrop framework so the payload reliably lands on
   * `dataTransfer` before the canvas drop handler reads it.
   *
   * The inner `<img>` has `draggable="false"` (template) so clicks on the
   * image bubble up to the `<li>` instead of triggering the browser's
   * built-in image-drag (which would put the image URL in dataTransfer
   * instead of our JSON payload).
   *
   * @param {DragEvent} event
   * @param {HTMLElement} row - The `<li>` content row (currentTarget).
   */
  #onRowDragStart(event, row) {
    const contentId = row?.dataset?.contentId;
    if (!contentId) return;
    const adapter = getAdapter();
    const data = adapter.getInteractiveData(this.actor);
    const rowData = data.contents?.find(c => c.id === contentId);
    if (!rowData) {
      dbg("generic-container-view:onRowDragStart", "content row not found in flag data", { contentId });
      return;
    }
    const payload = {
      type: "InteractiveContent",
      sourceActorUuid: this.actor.uuid,
      contentId,
      itemData: rowData
    };
    dbg("generic-container-view:onRowDragStart", "setting drag payload", { contentId, name: rowData.name });
    event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "all";
  }

  /**
   * Pickup-hand click on a content row. Resolves the player target, checks
   * proximity + lock, then dispatches `pickupItem` with `contentId` so the
   * GM-side helper pulls the row out of `contents[]` and creates a stub
   * item on the target.
   *
   * @param {MouseEvent} event
   * @param {HTMLElement} btn - The clicked button (has `data-content-id`).
   */
  async #onPickupClick(event, btn) {
    event.preventDefault();
    event.stopPropagation();
    const contentId = btn?.dataset?.contentId;
    if (!contentId) return;
    dbg("generic-container-view:onPickupClick", { contentId, actorName: this.actor?.name });

    // Same gates as the HUD pickup button on item-mode tokens.
    if (!checkProximity(this.actor)) return;
    if (!validateContainerAccess(this.actor, { checkOpen: false })) return;

    const targetActor = await resolvePickupTarget(this.actor);
    if (!targetActor) return;

    const tokenDoc = this.actor.token;
    if (!tokenDoc) {
      dbg("generic-container-view:onPickupClick", "no token on actor (sidebar template?), bail");
      return;
    }
    const sceneId = tokenDoc.parent.id;
    const tokenId = tokenDoc.id;

    // Partial-stack prompt — same UX as the token-level pickup HUD button.
    const adapter = getAdapter();
    const data = adapter.getInteractiveData(this.actor);
    const row = data.contents?.find(c => c.id === contentId);
    const rowQty = row?.quantity ?? 1;
    let chosenQty = null;
    if (rowQty > 1) {
      chosenQty = await promptItemQuantity({
        itemName: row?.name ?? "",
        max: rowQty,
        actionKey: "INTERACTIVE_ITEMS.Dialog.QuantityActionPickup",
        actionFormatArgs: { target: targetActor.name }
      });
      if (chosenQty == null) {
        dbg("generic-container-view:onPickupClick", "quantity dialog cancelled, bail");
        return;
      }
    }

    await dispatchGM(
      "pickupItem",
      { sceneId, tokenId, itemId: null, targetActorId: targetActor.id, quantity: chosenQty, contentId },
      async () => pickupItem(sceneId, tokenId, null, targetActor.id, chosenQty, contentId)
    );
  }

  /**
   * GM-only: remove a content row by its id from the `contents[]` array.
   *
   * @param {Event} event
   * @param {HTMLElement} target  The button element carrying `data-content-id`.
   */
  static async #onDeleteContent(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;
    const contentId = target.dataset.contentId;
    dbg("generic-container-view:onDeleteContent", { contentId, actorId: this.actor?.id });
    const adapter = getAdapter();
    const data = adapter.getInteractiveData(this.actor);
    const next = (data.contents ?? []).filter(c => c.id !== contentId);
    await adapter.setInteractiveData(this.actor, { contents: next });
    this.render();
  }

  /**
   * Remove this sheet from the per-actor cache when it closes so a subsequent
   * open creates a fresh instance rather than attempting to re-render a closed
   * window.
   *
   * @param {object} [options]
   * @returns {Promise<void>}
   */
  async close(options = {}) {
    dbg("generic-container-view:close", { actorName: this.actor?.name });
    GenericInteractiveContainerView.#instances.delete(this.actor?.uuid);
    return super.close(options);
  }
}
