/**
 * GenericInteractiveItemView — read-only ApplicationV2 sheet shown when a
 * player (or GM) opens an item-mode generic interactive actor token.
 *
 * Displays name, image, optional quantity badge (when quantity > 1), and
 * enriched HTML description. All data is sourced from the actor's
 * `flags["pick-up-stix"].interactive` blob via `adapter.getInteractiveData`.
 * The actor's `system.*` and `actor.items` are never accessed.
 *
 * Per-actor singleton cached in `#instances`; cleaned up in `close()`.
 */

import { getAdapter } from "../index.mjs";
import { createStateToggleButton } from "../../utils/domButtons.mjs";
import { toggleContainerLocked } from "../../transfer/ItemTransfer.mjs";
import { dbg } from "../../utils/debugLog.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const ActorSheetV2 = foundry.applications.sheets.ActorSheetV2;

/**
 * Read-only item view sheet for generic-mode interactive actors in
 * item mode. Shown to players and GMs when the token is clicked.
 */
export default class GenericInteractiveItemView
  extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** Per-actor singleton cache so repeat opens reuse the existing window. */
  static #instances = new Map();

  /**
   * Resolve the item view sheet for a given actor, creating one on first call
   * and returning the cached instance on subsequent calls.
   *
   * @param {Actor} actor
   * @returns {GenericInteractiveItemView}
   */
  static forActor(actor) {
    const key = actor.uuid;
    let sheet = GenericInteractiveItemView.#instances.get(key);
    if (!sheet) {
      dbg("generic-item-view:forActor", "creating new instance", { actorName: actor.name });
      sheet = new GenericInteractiveItemView({ document: actor });
      GenericInteractiveItemView.#instances.set(key, sheet);
    }
    return sheet;
  }

  static DEFAULT_OPTIONS = {
    classes: ["pick-up-stix", "generic-item-view", "sheet"],
    position: { width: 360, height: "auto" },
    window: { resizable: true },
    // Read-only — no form submission.
    form: { submitOnChange: false }
  };

  static PARTS = {
    body: { template: "modules/pick-up-stix/templates/item-view-generic.hbs" }
  };

  get title() {
    return getAdapter().getInteractiveDisplayName(this.actor);
  }

  /**
   * Build template context from the actor's interactive flag blob. Prefers
   * `data.itemData` for all display values but falls back to the top-level
   * flag fields (`data.name`, `data.img`, `data.description`) so the sheet
   * renders even for actors that were configured before `itemData` was
   * populated.
   *
   * @param {object} options
   * @returns {Promise<object>}
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const adapter = getAdapter();
    const data = adapter.getInteractiveData(this.actor);

    dbg("generic-item-view:_prepareContext", { actorName: this.actor?.name, hasItemData: !!data.itemData });

    // Prefer top-level interactive fields — those reflect the GM's current
    // edits via the config sheet. `data.itemData` is the snapshot taken when
    // a source item was dropped onto the config sheet and only changes on
    // a re-drop; using it directly would show stale name/img/description
    // after any edit. Quantity is sourced only from itemData.
    const snapshot = data.itemData ?? {};
    const itemData = {
      name: data.name || snapshot.name || "",
      img: data.img || snapshot.img || "",
      description: data.description || snapshot.description || "",
      quantity: snapshot.quantity ?? 1
    };

    context.itemData = itemData;
    context.showQuantity = (itemData.quantity ?? 1) > 1;
    context.descriptionHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      itemData.description,
      { async: true }
    );

    return context;
  }

  /**
   * Inject the GM-only window-header toggles (Lock, Configure) on every
   * render. Identify is intentionally omitted — generic mode has
   * supportsIdentification:false. Open/Close is also omitted — items don't
   * have an open state.
   *
   * @param {object} context
   * @param {object} options
   */
  _onRender(context, options) {
    super._onRender(context, options);
    if (!game.user.isGM) return;
    const header = this.element?.querySelector(".window-header");
    if (header) this.#injectHeaderToggles(header);
  }

  #injectHeaderToggles(header) {
    header.querySelectorAll(".ii-itemview-toggle").forEach(el => el.remove());

    const adapter = getAdapter();
    const isLocked = adapter.isInteractiveLocked(this.actor);
    const actor = this.actor;
    const buttons = [];

    buttons.push(createStateToggleButton({
      extraClass: "ii-itemview-toggle",
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

    // Configure: closes this view and opens the GM config sheet.
    buttons.push(createStateToggleButton({
      extraClass: "ii-itemview-toggle",
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
   * Remove this sheet from the per-actor cache when it closes so a subsequent
   * open creates a fresh instance rather than attempting to re-render a
   * closed window.
   *
   * @param {object} [options]
   * @returns {Promise<void>}
   */
  async close(options = {}) {
    dbg("generic-item-view:close", { actorName: this.actor?.name });
    GenericInteractiveItemView.#instances.delete(this.actor?.uuid);
    return super.close(options);
  }
}
