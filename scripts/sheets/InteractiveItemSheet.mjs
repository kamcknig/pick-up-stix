/**
 * InteractiveItemSheet — registered actor sheet for `pick-up-stix.interactiveItem`.
 *
 * Acts as a system-agnostic dispatcher: never renders its own UI. On `render()`
 * it routes to one of:
 *   - `getAdapter().renderConfigSheet(actor)` — base actor click or `renderConfig()` call
 *   - `getAdapter().renderContainerView(actor)` — token click on a container actor
 *   - `getAdapter().renderItemView(actor)` — token click on an item-mode actor
 *   - `showLimitedDialog(actor)` — non-GM player outside inspection range
 *
 * The actual config-form UI lives in adapter-owned sheet classes
 * (`Dnd5eInteractiveItemConfigSheet` V2 / `Pf2eInteractiveItemConfigSheet` V1)
 * so each system can use its own ApplicationV1/V2 conventions.
 *
 * Static helpers `pendingPicker`, `limitedDialogs`, `showLimitedDialog`,
 * `refreshLimitedDialog`, `promoteLimitedDialogsInRange` are kept here because
 * they're system-agnostic and called from elsewhere in the module.
 */

import { checkProximity } from "../transfer/ItemTransfer.mjs";
import { getAdapter } from "../adapter/index.mjs";
import { dbg } from "../utils/debugLog.mjs";
import { isModuleGM, isPlayerView } from "../utils/playerView.mjs";

const ActorSheetV2 = foundry.applications.sheets.ActorSheetV2;

export default class InteractiveItemSheet extends ActorSheetV2 {

  /** Actors with a kind-picker dialog open — suppress the auto-render flash. */
  static pendingPicker = new Set();

  /** Open limited-view dialogs keyed by actor UUID. */
  static limitedDialogs = new Map();

  /**
   * Render the limited-view dialog for an actor that the viewer is too far
   * away to inspect properly. Closes any existing dialog for the same actor
   * before opening the new one.
   */
  static async showLimitedDialog(actor) {
    dbg("sheet:showLimitedDialog", { actorName: actor.name, actorUuid: actor.uuid, isContainer: actor.system.isContainer });
    const key = actor.uuid;
    const existing = InteractiveItemSheet.limitedDialogs.get(key);
    if (existing) await existing.close();

    const system = actor.system;
    const title = system.limitedDisplayName;
    const body = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.limitedDisplayDescription,
      { async: true }
    );

    const dialog = new foundry.applications.api.DialogV2({
      window: { title },
      content: `<div class="pick-up-stix limited-view">${body}</div>`,
      buttons: [{
        action: "ok",
        label: game.i18n.localize("INTERACTIVE_ITEMS.Dialog.Close"),
        default: true
      }]
    });

    dialog.interactiveActor = actor;
    InteractiveItemSheet.limitedDialogs.set(key, dialog);
    const originalClose = dialog.close.bind(dialog);
    dialog.close = async (...args) => {
      InteractiveItemSheet.limitedDialogs.delete(key);
      return originalClose(...args);
    };

    await dialog.render({ force: true });
  }

  /**
   * Update the title and body of an open limited-view dialog without closing
   * and re-opening it (avoids losing the user's window position).
   */
  static async refreshLimitedDialog(actor) {
    dbg("sheet:refreshLimitedDialog", { actorName: actor.name, actorUuid: actor.uuid, hasDialog: InteractiveItemSheet.limitedDialogs.has(actor.uuid) });
    const dialog = InteractiveItemSheet.limitedDialogs.get(actor.uuid);
    if (!dialog?.element) return;

    const titleEl = dialog.element.querySelector(".window-title");
    if (titleEl) titleEl.textContent = actor.system.limitedDisplayName;

    const contentEl = dialog.element.querySelector(".limited-view");
    if (contentEl) {
      contentEl.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        actor.system.limitedDisplayDescription,
        { async: true }
      );
    }
  }

  /**
   * Walk every open limited-view dialog and promote it to the actor's real
   * sheet if the viewer has moved into inspection range. Preserves the
   * dialog's on-screen position so the new sheet appears in roughly the same
   * spot.
   */
  static async promoteLimitedDialogsInRange() {
    dbg("sheet:promoteLimitedDialogsInRange", { openDialogCount: InteractiveItemSheet.limitedDialogs.size });
    // Snapshot — dialog.close() mutates the Map during iteration.
    const entries = Array.from(InteractiveItemSheet.limitedDialogs);
    for (const [, dialog] of entries) {
      const actor = dialog.interactiveActor;
      if (!actor) continue;
      const inRange = checkProximity(actor, { silent: true, range: "inspection" });
      if (!inRange) continue;

      const rect = dialog.element?.getBoundingClientRect();
      const hasPosition = rect && rect.width > 0;

      dialog.close();

      if (!actor.system.embeddedItem) continue;
      const renderedSheet = await getAdapter().renderEmbeddedSheet(actor, { force: true });

      if (!hasPosition) continue;
      const el = renderedSheet?.element;
      if (!el) continue;

      const appRect = el.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - appRect.width);
      const maxTop = Math.max(0, window.innerHeight - appRect.height);
      const left = Math.max(0, Math.min(rect.left, maxLeft));
      const top = Math.max(0, Math.min(rect.top, maxTop));

      renderedSheet.setPosition({ left, top });
    }
  }

  /** True when the next render() should open the GM config sheet. */
  #configMode = false;

  static DEFAULT_OPTIONS = {
    classes: ["pick-up-stix", "interactive-item-sheet-dispatcher"],
    // Keep a tiny window footprint just in case Foundry forces a render of
    // this dispatcher (it should never visually appear).
    position: { width: 100, height: 100 },
    window: { resizable: false }
  };

  get _tokenDoc() {
    return this.actor.token ?? null;
  }

  /**
   * Dispatch entry point. Inspects actor / mode / viewer state and routes to
   * the correct adapter-owned sheet (config / container / item) or to the
   * limited-view dialog. Never calls `super.render()` — this class itself is
   * not meant to display.
   */
  async render(options = {}, _options = {}) {
    dbg("sheet:render", {
      actorName: this.actor?.name,
      actorId: this.actor?.id,
      configMode: this.#configMode,
      tokenDocId: this._tokenDoc?.id,
      isGM: isModuleGM(),
      isContainer: this.actor?.system?.isContainer,
      pendingPicker: InteractiveItemSheet.pendingPicker.has(this.actor?.id)
    });
    if (InteractiveItemSheet.pendingPicker.has(this.actor.id)) {
      dbg("sheet:render", "pendingPicker active, suppressing render");
      return this;
    }

    // Blank actor with no creation marker: either the picker hasn't populated
    // flags yet (suppress the empty-sheet flash) or a creation we don't own.
    if (!this.#configMode && !this._tokenDoc && this.actor.items.size === 0) {
      const MODULE_ID = "pick-up-stix";
      const hasMarker = this.actor.getFlag(MODULE_ID, "containerDefault")
        || this.actor.getFlag(MODULE_ID, "createKindConfirmed")
        || this.actor.getFlag(MODULE_ID, "ephemeral")
        || this.actor.system.sourceItemUuid;
      if (!hasMarker) return this;
    }

    const adapter = getAdapter();

    if (this.#configMode || !this._tokenDoc) {
      dbg("sheet:render", "config mode or base actor → adapter.renderConfigSheet");
      this.#configMode = false;
      await adapter.renderConfigSheet(this.actor, options);
      return this;
    }

    const system = this.actor.system;

    if (system.isContainer) {
      if (isPlayerView() && !checkProximity(this.actor, { silent: true, range: "inspection" })) {
        dbg("sheet:render", "container: player out of inspection range → showLimitedDialog");
        InteractiveItemSheet.showLimitedDialog(this.actor);
        return this;
      }
      const item = system.containerItem;
      if (item) {
        dbg("sheet:render", "container: delegating to adapter.renderContainerView", { itemId: item.id, itemName: item.name });
        await adapter.renderContainerView(this.actor, options);
        return this;
      }
    } else {
      if (isPlayerView() && !checkProximity(this.actor, { silent: true, range: "inspection" })) {
        dbg("sheet:render", "item: player out of inspection range → showLimitedDialog");
        InteractiveItemSheet.showLimitedDialog(this.actor);
        return this;
      }
      const item = this.actor.items.contents[0];
      if (item) {
        dbg("sheet:render", "item: delegating to adapter.renderItemView", { itemId: item.id, itemName: item.name });
        await adapter.renderItemView(this.actor, options);
        return this;
      }
    }

    dbg("sheet:render", "no embedded item → falling back to config sheet");
    await adapter.renderConfigSheet(this.actor, options);
    return this;
  }

  /**
   * Open the GM config sheet. Sets the dispatcher's #configMode flag so the
   * subsequent render() call routes to `adapter.renderConfigSheet()` even when
   * a token document is present (which would otherwise route to the system's
   * native sheet).
   */
  renderConfig() {
    dbg("sheet:renderConfig", { actorName: this.actor?.name, actorId: this.actor?.id });
    this.#configMode = true;
    return this.render({ force: true });
  }
}
