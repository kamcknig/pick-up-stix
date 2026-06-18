import { getAdapter } from "../index.mjs";
import { getPlayerCandidateTokens, purchaseItem } from "../../transfer/ItemTransfer.mjs";
import { dispatchGM } from "../../utils/gmDispatch.mjs";
import { notifyPurchase } from "../../utils/notify.mjs";
import { dbg } from "../../utils/debugLog.mjs";
import { buildShop, DEFAULT_GROUPING } from "./shopGrouping.mjs";
import { createRowControl } from "../../utils/domButtons.mjs";

const NPCActorSheet = dnd5e.applications.actor.NPCActorSheet;

/**
 * dnd5e vendor sheet. Subclasses dnd5e's NPCActorSheet so it inherits the entire
 * NPC sheet — layout, all tabs, content, CSS — and ADDS a Shop tab.
 *
 * Permission split:
 *  - Owner / GM: the full NPC sheet (every normal tab + content) PLUS the Shop tab.
 *  - LIMITED / OBSERVER players: the Shop tab only (storefront). The NPC tabs carry
 *    an `isOwner` condition, and `_configureRenderParts` renders a storefront-only
 *    part set for non-owners.
 *
 * Backed by Dnd5eVendorModel (extends dnd5e NPCData), so every inherited NPC
 * context read resolves with sane defaults.
 */
export default class Dnd5eVendorSheet extends NPCActorSheet {

  #currencyHookId = null;
  #controlHookId = null;
  #groupingId = DEFAULT_GROUPING;

  constructor(options) {
    super(options);
    // Players only ever get the Shop tab — default them onto it (the inherited
    // NPC default, "features", isn't rendered for them, so it must be overridden
    // or they'd land on a hidden/inactive tab). Owners keep the NPC default.
    if ( !this.document.isOwner ) this.tabGroups.primary = "shop";
  }

  static DEFAULT_OPTIONS = {
    classes: ["pick-up-stix", "vendor-sheet"],
    actions: {
      buyWare: Dnd5eVendorSheet.#onBuyWare,
      toggleShopVisible: Dnd5eVendorSheet.#onToggleShopVisible
    }
  };

  // Full NPC parts + our Shop tab body (same container the other tab bodies use,
  // so it nests in dnd5e's .sheet-body > .main-content > .tab-body structure).
  static PARTS = {
    ...NPCActorSheet.PARTS,
    shop: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: "modules/pick-up-stix/templates/vendor/shop.hbs",
      scrollable: [""]
    }
  };

  // Every inherited NPC tab, gated to owners (preserving any original condition);
  // plus the Shop tab, visible to everyone who can open the sheet (LIMITED+).
  static TABS = [
    ...NPCActorSheet.TABS.map(t => ({
      ...t,
      condition: (doc) => doc.isOwner && (t.condition ? t.condition(doc) : true)
    })),
    { tab: "shop", label: "INTERACTIVE_ITEMS.Vendor.ShopTab", icon: "fa-solid fa-store" }
  ];

  /**
   * Defensive no-op. Core ApplicationV2._prepareContext auto-prepares tabs only
   * when `Object.keys(this.constructor.TABS).length === 1`; dnd5e's `TABS` is an
   * ARRAY consumed by PrimarySheetMixin `_getTabs()`, so a single-entry array
   * would make core call `_prepareTabs()` and crash reading `config.tabs` off the
   * array element. We always ship multiple tabs, so this never fires today — kept
   * as a guard against a future single-tab trim. (Foundry v13 + v14.)
   *
   * @returns {null}
   */
  _getTabsConfig(_group) {
    return null;
  }

  /**
   * Non-owners (LIMITED / OBSERVER) get a storefront-only render — our shop-header
   * + the shop tab body + the nav — instead of dnd5e's bare LIMITED_PARTS or the
   * full management sheet. Owners (GM) fall through to the full NPC parts (all
   * tabs + the Shop tab).
   */
  _configureRenderParts(options) {
    if ( !this.actor.isOwner ) {
      return {
        header: { template: "modules/pick-up-stix/templates/vendor/shop-header.hbs" },
        shop: {
          container: { classes: ["tab-body"], id: "tabs" },
          template: "modules/pick-up-stix/templates/vendor/shop.hbs",
          scrollable: [""]
        },
        tabs: this.constructor.PARTS.tabs
      };
    }
    return super._configureRenderParts(options);
  }

  /**
   * Own the shop's Buy-button enabled state. Core `DocumentSheetV2#_toggleDisabled`
   * force-disables every `.window-content` form control on a non-editable (non-owner)
   * sheet from its async `_onRender` (identical in Foundry v13 + v14), so this state
   * can't live in the template — we set it here, after `await super._onRender` so it
   * runs last. Each Buy button is enabled only when the resolved buyer can afford that
   * row's item. Also registers (once) the live-update hooks that re-run this pass when
   * the buyer's currency or token selection changes.
   */
  async _onRender(context, options) {
    await super._onRender(context, options);   // let core _toggleDisabled run first
    // Re-enable each Buy button (core disables form controls on the non-owner sheet) and gate
    // it on whether the buyer can afford one unit — vendors sell one item per click.
    const adapter = getAdapter();
    const buyer = getPlayerCandidateTokens()[0]?.actor ?? null;
    for ( const button of this.element.querySelectorAll(".vendor-buy") ) {
      const itemId = button.closest("[data-item-id]")?.dataset.itemId;
      const item = itemId ? this.actor.items.get(itemId) : null;
      button.disabled = !(item && buyer && adapter.canAfford(buyer, item, 1));
    }
    this.#refreshSubtitleTooltips();
    this.#injectInventoryShopToggles();
    if (this.#currencyHookId === null) {       // register the live-update hooks once
      this.#currencyHookId = Hooks.on("updateActor", this.#onBuyerCurrencyChange.bind(this));
      // The buyer depends on the controlled token, so re-evaluate on selection changes too.
      this.#controlHookId = Hooks.on("controlToken", () => { if (this.rendered) this.render(); });
    }
  }

  /**
   * Re-evaluate subtitle truncation when a tab is shown. The GM's Shop tab is hidden
   * at first render (they land on an NPC tab), so the `_onRender` pass sees a zero-size
   * element and can't detect clipping; rerun once Shop becomes the active tab.
   */
  changeTab(tab, group, options) {
    super.changeTab(tab, group, options);
    if ( tab === "shop" ) this.#refreshSubtitleTooltips();
  }

  /**
   * Tooltip the full subtitle on any `.shop-ware-sub` that's visually clipped. Needs the
   * shop content visible (a hidden tab has no layout box → scrollWidth/clientWidth are 0),
   * so it's called from `_onRender` (player / re-render while on Shop) and `changeTab`.
   */
  #refreshSubtitleTooltips() {
    for ( const sub of this.element.querySelectorAll(".shop-ware-sub") ) {
      if ( sub.scrollWidth > sub.clientWidth ) sub.dataset.tooltip = sub.textContent;
      else delete sub.dataset.tooltip;
    }
  }

  /**
   * Inject a shop-visibility toggle into each Inventory-tab item row (GM only).
   * Appends a matching empty header spacer and a `.ii-row-controls-cell
   * pus-shop-toggle-cell` div containing the toggle to every `[data-item-id]` row.
   * Uses the same `.ii-row-controls-cell` class as `_injectActorInventoryIdentifyToggles`
   * so that function's idempotency guard (`:scope > .ii-row-controls-cell`) skips vendor
   * rows — the vendor gets only this toggle, not the interactive lock/identify/trash.
   * Called from `_onRender` which runs before the generic `renderNPCActorSheet` hook,
   * so our cell always wins the idempotency race.
   */
  #injectInventoryShopToggles() {
    if ( !game.user.isGM ) return;
    const root = this.element;
    // Append an empty header spacer for column alignment (idempotent).
    root.querySelectorAll(".items-section .items-header.header").forEach(header => {
      if ( header.querySelector(".ii-row-controls-cell") ) return;
      const cell = document.createElement("div");
      cell.className = "item-header ii-row-controls-cell pus-shop-toggle-cell";
      header.appendChild(cell);
    });
    // Append the toggle to each item row (idempotent via the same guard).
    root.querySelectorAll("[data-item-id]").forEach(el => {
      const item = this.actor.items.get(el.dataset.itemId);
      const itemRow = el.querySelector(".item-row");
      if ( !item || !itemRow || itemRow.querySelector(":scope > .ii-row-controls-cell") ) return;
      const visible = item.getFlag("pick-up-stix", "shopVisible") !== false;
      dbg("vendorSheet:injectInventoryShopToggles", { item: item.id, name: item.name, visible });
      const cell = document.createElement("div");
      cell.className = "item-detail ii-row-controls-cell pus-shop-toggle-cell";
      cell.appendChild(createRowControl({
        iconClass: "fa-solid fa-box-arrow-down-arrow-up",
        titleKey: "INTERACTIVE_ITEMS.Vendor.ToggleShopVisible",
        extraClass: "pick-up-stix-shop-toggle",
        active: visible,
        onClick: async () => {
          dbg("vendorSheet:shopToggleClick", { item: item.id, name: item.name, from: visible, to: !visible });
          await item.setFlag("pick-up-stix", "shopVisible", !visible);
        }
      }));
      itemRow.appendChild(cell);
    });
  }

  async close(options = {}) {
    if (this.#currencyHookId !== null) { Hooks.off("updateActor", this.#currencyHookId); this.#currencyHookId = null; }
    if (this.#controlHookId !== null) { Hooks.off("controlToken", this.#controlHookId); this.#controlHookId = null; }
    return super.close(options);
  }

  #onBuyerCurrencyChange(actor, changes) {
    if (!this.rendered) return;
    if (!foundry.utils.hasProperty(changes, "system.currency")) return;
    const buyer = getPlayerCandidateTokens()[0]?.actor ?? null;
    if (!buyer || buyer.id !== actor.id) return;
    dbg("vendorSheet:buyerCurrencyChange", "re-rendering wares", { actor: actor.id });
    this.render();                             // re-runs _onRender → recomputes affordability
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( partId === "shop" ) {
      context.shop = this.#prepareShop();
      context.isGM = game.user.isGM;
    }
    return context;
  }

  /**
   * Build the grouped shop structure from the vendor's physical items.
   * Delegates bucketing, column cell building, and sort order to the
   * grouping framework in shopGrouping.mjs — all dnd5e display logic
   * stays in that adapter-local module.
   *
   * @returns {{ groupingId, columnTemplate, headers, groups }}
   */
  #prepareShop() {
    const adapter = getAdapter();
    // Only physical items that are in stock AND not hidden by the GM (shopVisible !== false).
    // Absent flag (pre-existing items) is treated as visible.
    const items = this.actor.items.filter(i =>
      adapter.isPhysicalItem(i)
      && adapter.getItemQuantity(i) > 0
      && i.getFlag("pick-up-stix", "shopVisible") !== false
    );
    return buildShop(items, this.#groupingId);
  }

  static async #onBuyWare(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if ( !item ) { dbg("vendorSheet:onBuyWare", "no item for row, bail", { itemId }); return; }

    const qty = 1;   // vendors sell one unit per Buy click

    // Buyer = first pickup candidate (controlled non-interactive token, else the
    // assigned character's token on this scene) — the same resolution the pickup
    // flow uses, so players and GMs behave identically.
    const buyer = getPlayerCandidateTokens()[0]?.actor ?? null;
    if ( !buyer ) {
      dbg("vendorSheet:onBuyWare", "no buyer (no controlled token / scene character), bail");
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoBuyer"));
      return;
    }

    const adapter = getAdapter();
    if ( !adapter.canAfford(buyer, item, qty) ) {
      dbg("vendorSheet:onBuyWare", "buyer cannot afford qty, bail", { item: item.id, buyer: buyer.id, qty });
      ui.notifications.warn(game.i18n.format("INTERACTIVE_ITEMS.Notify.NotEnoughCoin", { name: item.name }));
      return;
    }

    dbg("vendorSheet:onBuyWare", "dispatching purchase", {
      vendor: this.actor.id, item: item.id, buyer: buyer.id, qty
    });
    await dispatchGM(
      "purchaseItem",
      { vendorActorId: this.actor.id, itemId: item.id, buyerActorId: buyer.id, quantity: qty },
      async () => purchaseItem(this.actor.id, item.id, buyer.id, qty)
    );
    if ( !game.user.isGM ) notifyPurchase(item.name, this.actor.name);  // buyer self-notifies
  }

  /**
   * Toggle an item's shopVisible flag. Active (true) → hidden (false) and vice-versa.
   * Triggering a flag update causes ApplicationV2 to re-render, which re-runs
   * #prepareShop → hidden items disappear from the list.
   *
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onToggleShopVisible(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if ( !item ) {
      dbg("vendorSheet:onToggleShopVisible", "no item for target, bail", { itemId });
      return;
    }
    const visible = item.getFlag("pick-up-stix", "shopVisible") !== false;
    dbg("vendorSheet:onToggleShopVisible", { item: item.id, name: item.name, from: visible, to: !visible });
    await item.setFlag("pick-up-stix", "shopVisible", !visible);   // → re-render → #prepareShop refilters
  }
}
