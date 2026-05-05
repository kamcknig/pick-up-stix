/**
 * Pf2eInteractiveItemConfigSheet — ApplicationV1 GM config dialog for
 * pick-up-stix interactive object actors on pf2e.
 *
 * Uses V1 conventions to match pf2e's own actor/item sheets:
 *   - extends `foundry.appv1.sheets.ActorSheet`
 *   - `getData()` for context, `_updateObject()` for form submission
 *   - jQuery `activateListeners(html)` for event binding
 *   - `_getHeaderButtons()` for the open/close, lock, identify toggles
 *   - file-picker buttons handled by FormApplication's `_activateFilePicker`
 *
 * Constructed by `Pf2eAdapter.renderConfigSheet()` and cached per-actor in
 * `#instances` so repeated clicks on the same actor reuse the open window.
 */

import { getAdapter } from "../index.mjs";
import { setContainerOpen, toggleContainerLocked } from "../../transfer/ItemTransfer.mjs";
import { dbg } from "../../utils/debugLog.mjs";

/**
 * pf2e GM-only config sheet for `pick-up-stix.interactiveItem` actors.
 */
export default class Pf2eInteractiveItemConfigSheet extends foundry.appv1.sheets.ActorSheet {

  /** Per-actor singleton cache so repeat opens reuse the existing window. */
  static #instances = new Map();

  /**
   * Resolve the config sheet for a given actor, creating one on first call
   * and returning the cached instance on subsequent calls.
   *
   * @param {Actor} actor
   * @returns {Pf2eInteractiveItemConfigSheet}
   */
  static forActor(actor) {
    const key = actor.uuid;
    let sheet = Pf2eInteractiveItemConfigSheet.#instances.get(key);
    if (!sheet) {
      sheet = new Pf2eInteractiveItemConfigSheet(actor);
      Pf2eInteractiveItemConfigSheet.#instances.set(key, sheet);
    }
    return sheet;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["pick-up-stix", "pf2e", "sheet", "actor", "interactive-item-config"],
      template: "modules/pick-up-stix/templates/item-config-v1.hbs",
      width: 420,
      height: "auto",
      resizable: true,
      submitOnChange: true,
      submitOnClose: true,
      closeOnSubmit: false
    });
  }

  get title() {
    return `${game.i18n.localize("INTERACTIVE_ITEMS.Sheet.Configure")}: ${this.actor.system.displayName}`;
  }

  get containerItem() {
    return this.actor.system.containerItem;
  }

  get _tokenDoc() {
    return this.actor.token ?? null;
  }

  /**
   * Build the V1 template context. Description fields are pre-enriched so the
   * `{{editor}}` helper can render them without an extra async pass.
   */
  async getData(options) {
    const context = await super.getData(options);
    const system = this.actor.system;
    context.actor = this.actor;
    context.system = system;
    context.isEditable = this.isEditable;
    context.isContainer = system.isContainer;
    context.needsItem = this.actor.items.size === 0 && !this._tokenDoc;
    context.isIdentified = system.isIdentified;
    context.displayName = system.displayName;

    if (system.isContainer) {
      const item = this.containerItem;
      context.hasContainerItem = !!item;
      context.containerName = system.resolveTokenName();
      context.containerImg = (system.isOpen && system.openImage)
        ? system.openImage
        : (item?.img ?? this.actor.img);
    } else {
      const item = this.actor.items.contents[0];
      context.hasItem = !!item;
      context.itemName = system.resolveTokenName();
      context.itemImg = system.resolveImage();
    }

    const enrich = (html) =>
      foundry.applications.ux.TextEditor.implementation.enrichHTML(html ?? "", { async: true });
    context.descriptionHTML = await enrich(system.description);
    context.unidentifiedDescriptionHTML = await enrich(system.unidentifiedDescription);
    context.limitedDescriptionHTML = await enrich(system.limitedDescription);

    return context;
  }

  /**
   * Bind data-action click handlers (image edit, open native sheet) and the
   * file-picker buttons. The form's `<input>` / `<button>` submission flow is
   * handled by FormApplication via `submitOnChange`.
   */
  activateListeners(html) {
    super.activateListeners(html);

    if (!this.isEditable) return;

    html.find("[data-action='editActorImage']").on("click", (event) => {
      event.preventDefault();
      const fp = new foundry.applications.apps.FilePicker.implementation({
        type: "image",
        current: this.actor.img,
        callback: (path) => this.actor.system.updateImage(path)
      });
      fp.render(true);
    });

    html.find("[data-action='openItemSheet']").on("click", async (event) => {
      event.preventDefault();
      const item = this.actor.items.contents[0];
      if (!item) return;
      await this.#syncItemImage(item);
      await this.close();
      await getAdapter().renderItemView(this.actor);
    });

    html.find("[data-action='openContainerSheet']").on("click", async (event) => {
      event.preventDefault();
      if (!this.containerItem) return;
      await this.close();
      await getAdapter().renderContainerView(this.actor);
    });
  }

  /**
   * V1 form submission. Inject `prototypeToken.texture.src` whenever `img` or
   * `system.unidentifiedImage` changes so the placed token's portrait stays in
   * sync with the configured identified/unidentified image.
   */
  async _updateObject(event, formData) {
    dbg("pf2e-config:_updateObject", { actorName: this.actor?.name, formKeys: Object.keys(formData) });
    const data = foundry.utils.expandObject(formData);

    // Re-flatten so we can patch the dotted keys consumed by Document.update.
    const flat = foundry.utils.flattenObject(data);

    if (flat.img && flat.img !== this.actor.img) {
      if (this.actor.system.isIdentified || !this.actor.system.unidentifiedImage) {
        flat["prototypeToken.texture.src"] = flat.img;
      }
    }
    if ("system.unidentifiedImage" in flat && !this.actor.system.isIdentified) {
      const newUnidentifiedImage = flat["system.unidentifiedImage"];
      if (newUnidentifiedImage) flat["prototypeToken.texture.src"] = newUnidentifiedImage;
      else flat["prototypeToken.texture.src"] = flat.img || this.actor.img;
    }

    return this.actor.update(flat);
  }

  /**
   * Foundry V1 `_replaceHTML` only swaps `.window-content` on re-render —
   * the `.window-header` (and our injected toggles in it) is never refreshed,
   * so `_getHeaderButtons` is effectively a one-shot at initial render.
   * Override `_render` to re-sync the existing header buttons' icon, tooltip,
   * and `active` state after each render so they always reflect the actor's
   * current isOpen / isLocked / isIdentified.
   *
   * @param {boolean} force
   * @param {object} options
   */
  async _render(force, options) {
    const result = await super._render(force, options);
    this.#refreshHeaderToggleVisuals();
    return result;
  }

  /**
   * Walk the live header buttons and update each toggle's icon class and
   * tooltip in place. Click handlers were bound at initial render with
   * closures that read live actor state, so they don't need to be re-bound.
   */
  #refreshHeaderToggleVisuals() {
    const header = this.element?.[0]?.querySelector(".window-header");
    if (!header) return;
    const system = this.actor.system;

    const updateToggle = (selector, iconClassName, tooltip) => {
      const btn = header.querySelector(selector);
      if (!btn) return;
      const i = btn.querySelector("i");
      if (i) i.className = iconClassName;
      if (tooltip) {
        btn.dataset.tooltip = tooltip;
        btn.setAttribute("aria-label", tooltip);
      }
    };

    if (system.isContainer) {
      updateToggle(
        ".ii-toggle-open",
        `fas ${system.isOpen ? "fa-box-open" : "fa-box"}`,
        game.i18n.localize(system.isOpen
          ? "INTERACTIVE_ITEMS.Sheet.StateOpened"
          : "INTERACTIVE_ITEMS.Sheet.StateClosed")
      );
    }

    updateToggle(
      ".ii-toggle-lock",
      `fas ${system.isLocked ? "fa-lock" : "fa-lock-open"}`,
      game.i18n.localize(system.isLocked
        ? "INTERACTIVE_ITEMS.Sheet.StateLocked"
        : "INTERACTIVE_ITEMS.Sheet.StateUnlocked")
    );

    const identCfg = getAdapter().getIdentifyButtonConfig(system.isIdentified);
    const family = system.isIdentified ? (identCfg.iconFamilyOn ?? "fas") : (identCfg.iconFamilyOff ?? "fas");
    const icon = system.isIdentified ? identCfg.iconOn : identCfg.iconOff;
    const labelKey = system.isIdentified ? identCfg.labelOnKey : identCfg.labelOffKey;
    updateToggle(".ii-toggle-identify", `${family} ${icon}`, game.i18n.localize(labelKey));
  }

  /**
   * V1 header buttons — Foundry calls this on every render. Module-specific
   * toggles are emitted icon-only (empty label) and use a single-token `class`
   * because Foundry's V1 click delegation looks the descriptor up via
   * `event.currentTarget.classList.contains(b.class)` — a multi-token string
   * fails that lookup and crashes the click handler with
   * `Cannot read properties of undefined (reading 'onclick')`.
   *
   * Active/inactive state is conveyed by the icon itself (lock vs lock-open,
   * box vs box-open), so no separate "active" class is needed.
   */
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    if (!this.isEditable) return buttons;

    const system = this.actor.system;

    if (system.isContainer) {
      buttons.unshift({
        label: "",
        tooltip: game.i18n.localize(system.isOpen
          ? "INTERACTIVE_ITEMS.Sheet.StateOpened"
          : "INTERACTIVE_ITEMS.Sheet.StateClosed"),
        class: "ii-toggle-open",
        icon: `fas ${system.isOpen ? "fa-box-open" : "fa-box"}`,
        onclick: () => setContainerOpen(this.actor, !this.actor.system.isOpen)
      });
    }

    buttons.unshift({
      label: "",
      tooltip: game.i18n.localize(system.isLocked
        ? "INTERACTIVE_ITEMS.Sheet.StateLocked"
        : "INTERACTIVE_ITEMS.Sheet.StateUnlocked"),
      class: "ii-toggle-lock",
      icon: `fas ${system.isLocked ? "fa-lock" : "fa-lock-open"}`,
      onclick: () => toggleContainerLocked(this.actor)
    });

    const identCfg = getAdapter().getIdentifyButtonConfig(system.isIdentified);
    const identIconFamily = system.isIdentified
      ? (identCfg.iconFamilyOn ?? "fas")
      : (identCfg.iconFamilyOff ?? "fas");
    const identIcon = system.isIdentified ? identCfg.iconOn : identCfg.iconOff;
    const identLabelKey = system.isIdentified ? identCfg.labelOnKey : identCfg.labelOffKey;
    buttons.unshift({
      label: "",
      tooltip: game.i18n.localize(identLabelKey),
      class: "ii-toggle-identify",
      icon: `${identIconFamily} ${identIcon}`,
      onclick: () => {
        const item = this.actor.system.embeddedItem;
        const adapter = getAdapter();
        if (!item || adapter.isItemIdentified(item) === undefined) return;
        adapter.performIdentifyToggle(item);
      }
    });

    return buttons;
  }

  /**
   * If the embedded item's image has drifted from the actor's resolved image
   * (identified vs unidentified), push the actor's resolved image down to the
   * item before opening its sheet. GM-only.
   */
  async #syncItemImage(item) {
    if (!game.user.isGM) return;
    const expectedImg = this.actor.system.resolveImage();
    if (item.img !== expectedImg) await item.update({ img: expectedImg });
  }

  _canDragDrop(_selector) {
    return true;
  }

  /**
   * Drop handler for assigning the actor's embedded item. Mirrors the dnd5e
   * config sheet's drop logic but uses pf2e's `isPhysicalItem` capability —
   * pf2e's "physical item" predicate replaces dnd5e's `quantity in system`
   * heuristic.
   */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    dbg("pf2e-config:_onDrop", { dataType: data.type, uuid: data.uuid });
    if (data.type !== "Item") return;

    const item = await fromUuid(data.uuid);
    if (!item) return;

    const adapter = getAdapter();
    if (!adapter.isPhysicalItem(item)) {
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotPhysical"));
      return;
    }

    if (!game.user.isGM) return;

    const itemData = item.toObject();
    delete itemData._id;

    adapter.stampNewItemIdentified(itemData, true);

    if (this.actor.items.size > 0) {
      const ids = this.actor.items.map(i => i.id);
      await this.actor.deleteEmbeddedDocuments("Item", ids);
    }

    const updates = {
      name: item.name,
      img: item.img,
      "prototypeToken.name": item.name,
      "prototypeToken.texture.src": item.img
    };
    if (item.system.description?.value) {
      updates["system.description"] = item.system.description.value;
    }
    const droppedUnidentifiedName = adapter.getItemUnidentifiedName(item);
    const droppedUnidentifiedDescription = adapter.getItemUnidentifiedDescription(item);
    if (droppedUnidentifiedName) updates["system.unidentifiedName"] = droppedUnidentifiedName;
    if (droppedUnidentifiedDescription) updates["system.unidentifiedDescription"] = droppedUnidentifiedDescription;

    await this.actor.update(updates);

    const [createdItem] = await this.actor.createEmbeddedDocuments("Item", [itemData]);

    if (createdItem) {
      const allIdentificationChanges = {
        isIdentified: true,
        unidentifiedName: this.actor.system.unidentifiedName,
        description: this.actor.system.description,
        unidentifiedDescription: this.actor.system.unidentifiedDescription
      };
      const itemUpdates = adapter.buildItemIdentificationUpdate(this.actor, allIdentificationChanges);
      if (Object.keys(itemUpdates).length > 0) await createdItem.update(itemUpdates);
    }

    ui.notifications.info(game.i18n.format("INTERACTIVE_ITEMS.Notify.Deposited", { name: item.name }));
  }

  /**
   * Tear-down: drop the per-actor instance cache entry, then run the dnd5e-
   * equivalent abandoned-actor cleanup (delete the kind-picker actor if the
   * GM dismissed without ever dropping an item).
   */
  async close(options = {}) {
    dbg("pf2e-config:close", { actorName: this.actor?.name, actorId: this.actor?.id });
    const actor = this.actor;
    Pf2eInteractiveItemConfigSheet.#instances.delete(actor?.uuid);
    const result = await super.close(options);

    const MODULE_ID = "pick-up-stix";
    if (actor && game.actors.has(actor.id) && !actor.token && game.user.isGM
      && actor.getFlag(MODULE_ID, "createKindConfirmed")
      && actor.items.size === 0) {
      await actor.delete();
    }
    return result;
  }
}
