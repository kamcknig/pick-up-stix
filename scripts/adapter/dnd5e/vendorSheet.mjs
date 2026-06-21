import { getAdapter } from "../index.mjs";
import { getPlayerCandidateTokens, purchaseItem, purchaseCart } from "../../transfer/ItemTransfer.mjs";
import { dispatchGM } from "../../utils/gmDispatch.mjs";
import { notifyPurchase } from "../../utils/notify.mjs";
import { dbg } from "../../utils/debugLog.mjs";
import { buildShop, DEFAULT_GROUPING, buildSettingsGroups } from "./shopGrouping.mjs";
import { createRowControl } from "../../utils/domButtons.mjs";
import { emitSocketEvent } from "../../socket/SocketHandler.mjs";
import { getVendorQueue, findUserVendorQueues, promptVendorQueueSwitch } from "../../utils/vendorQueue.mjs";
import { getVendorFavor, getVendorFavorFactor, getFavorMin, getFavorMax, getFavorFactorMin, getFavorFactorMax, getFavorFactorDefault, getVendorGroupingFactor, getVendorGlobalFactor, getMaxPriceFactor } from "../../utils/vendorPricing.mjs";
import { saveDefaultInventory, computeRestockDiff, applyRestock, promptRestockRemoval }
  from "../../utils/vendorInventory.mjs";

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
  #deleteItemHookId = null;
  #updateItemHookId = null;
  #queueHookId = null;
  #groupingId = DEFAULT_GROUPING;
  #settingsBy = "type";                 // "type" | "rarity" — which dimension the factor list edits
  #expandedFactorRows = new Set();      // `${dimension}:${key}` rows currently expanded (survives re-render)
  #favorCollapsed = true;               // vendor-settings panel — always starts collapsed on open; toggled live
  #cart = new Map();   // itemId -> quantity to buy
  #renderTimer = null;

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
      toggleCart: Dnd5eVendorSheet.#onToggleCart,
      clearCart: Dnd5eVendorSheet.#onClearCart,
      checkoutCart: Dnd5eVendorSheet.#onCheckoutCart,
      stepCartQty: Dnd5eVendorSheet.#onStepCartQty,
      toggleShopVisible: Dnd5eVendorSheet.#onToggleShopVisible,
      toggleFavor: Dnd5eVendorSheet.#onToggleFavor,
      settingsBy: Dnd5eVendorSheet.#onSettingsBy,
      toggleFactorRow: Dnd5eVendorSheet.#onToggleFactorRow,
      toggleQueue: Dnd5eVendorSheet.#onToggleQueue
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
   * Stocking the vendor MOVES items rather than copying them. After dnd5e processes the drop
   * (creating/merging the item on the vendor), delete the drag source when it came from another
   * actor's inventory — a real transfer. Drags from the world/compendium have no actor parent and
   * are left untouched; reordering within the vendor (same actor) is a no-op. GM-only in practice
   * (players never see the inventory tab). (Foundry v13 + v14, dnd5e.)
   */
  async _onDrop(event) {
    let source = null;
    try {
      const data = JSON.parse(event.dataTransfer?.getData?.("text/plain") ?? "null");
      if ( data?.type === "Item" && data.uuid ) source = await fromUuid(data.uuid);
    } catch (_e) { source = null; }

    const before = this.actor.items.size;
    const result = await super._onDrop(event);
    const stocked = this.actor.items.size > before
      || (Array.isArray(result) ? result.length > 0 : !!result);
    if ( stocked && source?.parent?.documentName === "Actor" && source.parent.id !== this.actor.id ) {
      dbg("vendorSheet:onDrop", "stocking moves the item — deleting source", { source: source.id, from: source.parent?.id });
      await source.delete();
    }
    return result;
  }

  /**
   * Coalesce bursts of re-renders into one. A cart checkout fires several document
   * updates in quick succession (currency debit, stock update, stock delete) — on the
   * buyer's client when the GM buys inline, or as they propagate from the GM when a
   * player buys — and each would otherwise re-render the sheet and flicker the shop
   * icons. Debounce non-forced renders so the burst settles into a single render. Cart
   * toggles use `#refreshCart` (direct DOM, no render) so they stay instant; forced
   * renders (e.g. the initial open) pass through immediately.
   */
  render(...args) {
    const force = args[0] === true || args[0]?.force === true;
    if ( force ) return super.render(...args);
    if ( this.#renderTimer ) clearTimeout(this.#renderTimer);
    this.#renderTimer = setTimeout(() => { this.#renderTimer = null; super.render(); }, 150);
    return Promise.resolve(this);
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
    await this.#clampFavorFlags();             // sync out-of-bounds favor/factor flags to current limits
    this.#injectPortraitClip();                 // wrap the portrait so the figure masks at the frame
    this.#repositionEditToggle();               // move dnd5e's edit toggle next to the XP badge
    this.#repositionInitiativeDie();            // move initiative d20 above the vendor name (GM only)
    this.#repositionPortraitToggle();           // move portrait/token toggle above the initiative die (GM only, edit mode)
    this.#applyShopHeaderVisibility();   // keep NPC abilities card + legendary row hidden on the Shop tab
    await this.#injectGmShopBio();          // mirror the player storefront bio under the name (Shop tab)
    this.#wireFavorControls();              // wire favor sliders in the Shop tab (GM only)
    this.#wireSettingsControls();           // wire grouping-factor controls in the Shop tab (GM only)
    // Re-evaluate cart state and buy-button gating after core _toggleDisabled has run.
    // #refreshCart owns the disabled state for both basket toggles and buy buttons.
    this.#refreshCart();
    this.#applyWareTooltips();
    this.#injectInventoryShopToggles();
    this.#injectInventoryShopAllToggle();
    this.#fixListControlsPrefs();
    if (this.#currencyHookId === null) {       // register the live-update hooks once
      this.#currencyHookId = Hooks.on("updateActor", this.#onBuyerCurrencyChange.bind(this));
      // The buyer depends on the controlled token, so re-evaluate on selection changes too.
      this.#controlHookId = Hooks.on("controlToken", () => { if (this.rendered) this.render(); });
      // Keep the cart in sync with stock: purge an entry when its item leaves the shop (deleted,
      // GM-hidden, or sold out) and rebalance it down when stock drops below the cart quantity.
      // Fires on this and every other client with the sheet open.
      this.#deleteItemHookId = Hooks.on("deleteItem", this.#onVendorCartItemChanged.bind(this));
      this.#updateItemHookId = Hooks.on("updateItem", this.#onVendorCartItemChanged.bind(this));
      // Re-render when the shopping queue changes (strip + gating follow the flag).
      this.#queueHookId = Hooks.on("updateActor", this.#onQueueChange.bind(this));
      // Cart quantity inputs (multi-stock wares). One delegated change listener on the root,
      // which survives shop-part re-renders and is torn down with the element on close.
      this.element.addEventListener("change", this.#onCartQtyChange.bind(this));
    }
  }

  /**
   * Wrap the portrait media in a `.pus-portrait-clip` box so the break-out figure is masked
   * flush at the frame's right + bottom (overflow:hidden on a box anchored there) while
   * bleeding up + left. The player shop-header ships this box in markup (no-op here); the GM
   * npc-header re-renders a bare `.portrait > img` each render, so we idempotently re-wrap it.
   * (Foundry v13 + v14.)
   */
  #injectPortraitClip() {
    const portrait = this.element.querySelector(".sheet-header .portrait");
    if ( !portrait || portrait.querySelector(":scope > .pus-portrait-clip") ) return;
    const media = portrait.querySelector(":scope > img, :scope > video");
    if ( !media ) return;
    dbg("vendorSheet:injectPortraitClip", "wrapping portrait media in clip box");
    const clip = document.createElement("div");
    clip.className = "pus-portrait-clip";
    portrait.insertBefore(clip, media);
    clip.appendChild(media);
  }

  /**
   * Move dnd5e's edit-mode toggle (the `.mode-slider` it prepends to the window header)
   * to sit immediately left of the XP badge (`.cr-xp`, inside `.header-elements`).
   * Idempotent and re-checked each render since dnd5e re-asserts the toggle on
   * ownership / mode changes. (Foundry v13 + v14, dnd5e NPC window header.)
   */
  #repositionEditToggle() {
    const slider = this.element.querySelector(".window-header .mode-slider");
    const crXp = this.element.querySelector(".window-header .cr-xp");
    if ( !slider || !crXp || crXp.previousElementSibling === slider ) return;
    dbg("vendorSheet:repositionEditToggle", "moving edit toggle left of the XP badge");
    crXp.before(slider);
  }

  /**
   * Move dnd5e's portrait/token image toggle (`flags.dnd5e.showTokenPortrait`) from the
   * portrait column to sit just above the relocated initiative die in the name container,
   * left-aligned with it. GM only. The toggle is only rendered in edit mode (the template
   * wraps it in `{{#if editable}}`), so a missing-toggle bail naturally scopes this to edit
   * mode. Idempotent and re-checked each render since dnd5e re-renders the header part.
   * Runs AFTER #repositionInitiativeDie so the initiative wrapper is already in the name
   * container to anchor against. (Foundry v13 + v14, dnd5e NPC header.)
   */
  #repositionPortraitToggle() {
    if ( !this.actor.isOwner ) return;
    const input = this.element.querySelector('.sheet-header input[name="flags.dnd5e.showTokenPortrait"]');
    const toggle = input?.closest("label.slide-toggle");
    if ( !toggle ) return;
    const wrapper = this.element.querySelector(".sheet-header .right.stats .top .left .initiative-wrapper");
    if ( !wrapper ) return;
    if ( wrapper.previousElementSibling === toggle ) return;
    dbg("vendorSheet:repositionPortraitToggle", "moving portrait toggle above initiative die");
    wrapper.before(toggle);
  }

  /** Move dnd5e's initiative d20 from its portrait overlay to above the vendor name (GM only). */
  #repositionInitiativeDie() {
    if ( !this.actor.isOwner ) return;
    const nameContainer = this.element.querySelector(".sheet-header .right.stats .top .left");
    if ( !nameContainer ) return;
    const name = nameContainer.querySelector(".document-name");
    if ( !name ) return;
    if ( name.previousElementSibling?.classList.contains("initiative-wrapper") ) return;
    const wrapper = this.element.querySelector(".sheet-header .portrait .initiative-wrapper");
    if ( !wrapper ) return;
    dbg("vendorSheet:repositionInitiativeDie", "moving initiative die above vendor name");
    name.before(wrapper);
  }

  /**
   * If the stored favor / favorFactor flags are outside the current world-setting bounds,
   * clamp them in a single batched actor update. Only runs for GMs (players can't write
   * flags). No-op when both values are already in range, so it never triggers a spurious
   * re-render on normal open.
   */
  async #clampFavorFlags() {
    if ( !game.user.isGM ) return;
    const rawFavor = Number(this.actor.getFlag("pick-up-stix", "favor"));
    const rawFactor = Number(this.actor.getFlag("pick-up-stix", "favorFactor"));
    const rawGlobal = Number(this.actor.getFlag("pick-up-stix", "globalPriceFactor"));
    const max = getMaxPriceFactor();
    const clampedFavor = Number.isFinite(rawFavor)
      ? Math.max(getFavorMin(), Math.min(getFavorMax(), Math.round(rawFavor)))
      : null;
    const clampedFactor = Number.isFinite(rawFactor)
      ? Math.max(getFavorFactorMin(), Math.min(getFavorFactorMax(), Math.round(rawFactor)))
      : null;
    const clampedGlobal = Number.isFinite(rawGlobal)
      ? Math.max(0, Math.min(max, Math.round(rawGlobal)))
      : null;
    const updates = {};
    if ( clampedFavor !== null && clampedFavor !== rawFavor ) updates["flags.pick-up-stix.favor"] = clampedFavor;
    if ( clampedFactor !== null && clampedFactor !== rawFactor ) updates["flags.pick-up-stix.favorFactor"] = clampedFactor;
    if ( clampedGlobal !== null && clampedGlobal !== rawGlobal ) updates["flags.pick-up-stix.globalPriceFactor"] = clampedGlobal;
    if ( !foundry.utils.isEmpty(updates) ) {
      dbg("vendorSheet:clampFavorFlags", { vendor: this.actor.id, updates });
      await this.actor.update(updates);
    }
  }

  /** Hide inherited NPC header chrome that has no place in the storefront — the abilities card and
   *  the legendary/lair (.bottom) row — on the Shop tab; restore them on every other tab. No-op for
   *  any section not present (e.g. the player storefront header). */
  #applyShopHeaderVisibility() {
    const onShop = this.tabGroups.primary === "shop";
    for ( const sel of [".sheet-header .ability-scores", ".sheet-header .right.stats .bottom"] ) {
      const el = this.element.querySelector(sel);
      if ( el ) el.style.display = onShop ? "none" : "";
    }
  }

  /**
   * GM only, Shop tab only: mirror the player storefront by showing the vendor's public biography
   * under the name in the NPC header. Removed on every other tab and when there's no biography, so
   * the header falls back to its normal dnd5e content. Enriched to match the player view (secrets
   * hidden). (Foundry v13 + v14, dnd5e NPC header.)
   */
  async #injectGmShopBio() {
    if ( !game.user.isGM ) return;
    const nameBox = this.element.querySelector(".sheet-header .right.stats .top .left");
    if ( !nameBox ) return;
    let bio = nameBox.querySelector(":scope > .pus-vendor-bio");
    const raw = this.actor.system?.details?.biography?.public ?? "";
    if ( this.tabGroups.primary !== "shop" || !raw.trim() ) {
      if ( bio ) { dbg("vendorSheet:injectGmShopBio", "removing bio (off-shop or empty)"); bio.remove(); }
      return;
    }
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    const html = await TE.enrichHTML(raw, { secrets: false, relativeTo: this.actor });
    if ( !bio ) {
      bio = document.createElement("div");
      bio.className = "pus-vendor-bio";
      nameBox.appendChild(bio);
    }
    dbg("vendorSheet:injectGmShopBio", "showing bio on shop tab");
    bio.innerHTML = html;
  }

  /**
   * Wire the favor / favorFactor sliders in the Shop tab (GM only). The shop part is rebuilt on
   * every render, so the DOM is fresh and listeners are re-added; a dataset marker guards against a
   * double-bind within one DOM instance. `input` updates the live value label; `change` clamps and
   * writes the flag (which re-renders + re-prices the shop) — identical behavior to the old header
   * card.
   */
  #wireFavorControls() {
    if ( !game.user.isGM ) return;
    const panel = this.element.querySelector(".pus-favor-panel");
    if ( !panel || panel.dataset.pusWired === "1" ) return;
    panel.dataset.pusWired = "1";
    const sign = (v) => `${v > 0 ? "+" : ""}${v}`;
    for ( const range of panel.querySelectorAll(".pus-favor-range") ) {
      const valueEl = range.closest(".pus-favor-slider").querySelector(".pus-favor-value");
      const isFavor = range.dataset.flag === "favor";
      const fmt = isFavor ? (v) => sign(v) : (v) => `${v}%`;
      range.addEventListener("input", () => { valueEl.textContent = fmt(Number(range.value)); });
      range.addEventListener("change", async () => {
        const raw = Math.round(Number(range.value) || 0);
        const v = isFavor
          ? Math.max(getFavorMin(), Math.min(getFavorMax(), raw))
          : Math.max(getFavorFactorMin(), Math.min(getFavorFactorMax(), raw || getFavorFactorDefault()));
        dbg("vendorSheet:favorControlChange", { vendor: this.actor.id, flag: range.dataset.flag, value: v });
        await this.actor.setFlag("pick-up-stix", range.dataset.flag, v);
      });
    }
  }

  /** Wire the global price factor slider and per-grouping sliders in the settings panel (GM only). */
  #wireSettingsControls() {
    if ( !game.user.isGM ) return;
    const list = this.element.querySelector(".pus-factor-list");
    if ( !list || list.dataset.pusWired === "1" ) return;
    list.dataset.pusWired = "1";
    const max = getMaxPriceFactor();
    const clamp = (v) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

    // Global price factor: range + number input above the settings-by toggle.
    const globalRoot = list.closest(".pus-favor-content-inner");
    const globalRange = globalRoot?.querySelector(".pus-global-factor-range");
    const globalNum   = globalRoot?.querySelector(".pus-global-factor-num");
    if ( globalRange ) {
      globalRange.addEventListener("input", () => { if ( globalNum ) globalNum.value = String(clamp(globalRange.value)); });
      if ( globalNum ) globalNum.addEventListener("input", () => { globalRange.value = String(clamp(globalNum.value)); });
      const commitGlobal = async (el) => {
        const v = clamp(el.value);
        dbg("vendorSheet:globalFactorChange", { vendor: this.actor.id, value: v });
        await this.actor.setFlag("pick-up-stix", "globalPriceFactor", v);
      };
      globalRange.addEventListener("change", () => commitGlobal(globalRange));
      if ( globalNum ) globalNum.addEventListener("change", () => commitGlobal(globalNum));
    }

    for ( const row of list.querySelectorAll(".pus-factor-row") ) {
      const range = row.querySelector(".pus-factor-range");
      const num   = row.querySelector(".pus-factor-num");
      const mult  = row.querySelector(".pus-factor-mult");
      if ( !range || !num ) continue;
      const flagKey = `groupingFactors.${row.dataset.dimension}.${row.dataset.key}`;
      const syncLive = (v) => {
        num.value = String(v);
        if ( mult ) mult.textContent = `×${(v / 100).toFixed(2)}`;
      };
      range.addEventListener("input", () => syncLive(clamp(range.value)));
      num.addEventListener("input", () => {
        range.value = String(clamp(num.value));
        if ( mult ) mult.textContent = `×${(clamp(num.value) / 100).toFixed(2)}`;
      });
      const commit = async (el) => {
        const v = clamp(el.value);
        dbg("vendorSheet:factorChange", { vendor: this.actor.id, flagKey, value: v });
        await this.actor.setFlag("pick-up-stix", flagKey, v);
      };
      range.addEventListener("change", () => commit(range));
      num.addEventListener("change", () => commit(num));
    }
  }

  /**
   * Re-evaluate subtitle truncation when a tab is shown. The GM's Shop tab is hidden
   * at first render (they land on an NPC tab), so the `_onRender` pass sees a zero-size
   * element and can't detect clipping; rerun once Shop becomes the active tab.
   */
  changeTab(tab, group, options) {
    super.changeTab(tab, group, options);
    this.#applyShopHeaderVisibility();   // swap abilities + legendary visibility with the active tab
    this.#injectGmShopBio();             // show/hide the header bio with the active tab
  }

  /**
   * Decorate each shop ware's identity block (icon + name + subtitle) with a
   * rich item tooltip via the adapter — the native dnd5e item card on dnd5e, a
   * formatted fallback elsewhere. Replaces the old subtitle-clip tooltip; the
   * card supersedes it (it carries the full description). Pure attribute setting
   * (no layout reads), so it works even while the Shop tab is hidden at first
   * render — no changeTab re-run needed.
   */
  #applyWareTooltips() {
    const adapter = getAdapter();
    let wares = 0;
    for ( const row of this.element.querySelectorAll(".shop-ware[data-item-id]") ) {
      const item = this.actor.items.get(row.dataset.itemId);
      const main = row.querySelector(".shop-ware-main");
      if ( !item || !main ) continue;
      adapter.applyItemTooltip(main, item);
      wares++;
    }
    dbg("vendorSheet:applyWareTooltips", { wares });
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
        iconClass: "fa-solid fa-store",
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

  /**
   * GM-only master shop toggle, injected between the inventory's currency row and the items list.
   * "All" + a box icon that adds every physical item to the shop — or removes them all if they're
   * already all in. The box sits in a 40px right-aligned cell so it column-aligns with the
   * per-row toggles.
   */
  #injectInventoryShopAllToggle() {
    if ( !game.user.isGM ) return;
    if ( this.element.querySelector(".pus-shop-all-row") ) return;   // idempotent
    // Scope to the Inventory tab/part — the NPC sheet ALSO renders a <dnd5e-inventory> in the
    // Features tab, so an unscoped ".inventory-element .items-list" grabs that one (DOM order),
    // and _onRender fires while Features is the active tab. Insert before the inventory items list.
    const invPart = this.element.querySelector('[data-application-part="inventory"]')
      || this.element.querySelector('.tab[data-tab="inventory"]');
    const list = invPart?.querySelector(".items-list");
    if ( !list ) return;
    const adapter = getAdapter();
    const physical = this.actor.items.filter(i => adapter.isPhysicalItem(i));
    const allVisible = physical.length > 0
      && physical.every(i => i.getFlag("pick-up-stix", "shopVisible") !== false);
    dbg("vendorSheet:injectInventoryShopAllToggle", { physical: physical.length, allVisible });

    const row = document.createElement("div");
    row.className = "pus-shop-all-row";
    const label = document.createElement("span");
    label.className = "pus-shop-all-label";
    label.textContent = game.i18n.localize("INTERACTIVE_ITEMS.Vendor.AllShop");
    const cell = document.createElement("div");
    cell.className = "ii-row-controls-cell pus-shop-toggle-cell";
    cell.appendChild(createRowControl({
      iconClass: "fa-solid fa-store",
      titleKey: "INTERACTIVE_ITEMS.Vendor.ToggleAllShop",
      extraClass: "pick-up-stix-shop-toggle",
      active: allVisible,
      onClick: async () => {
        const next = !allVisible;
        dbg("vendorSheet:shopAllToggleClick", { from: allVisible, to: next, count: physical.length });
        const updates = physical.map(i => ({ _id: i.id, "flags.pick-up-stix.shopVisible": next }));
        if ( updates.length ) await this.actor.updateEmbeddedDocuments("Item", updates);
      }
    }));
    const actions = document.createElement("div");
    actions.className = "pus-shop-all-actions";
    actions.appendChild(createRowControl({
      iconClass: "fa-solid fa-floppy-disk",
      titleKey: "INTERACTIVE_ITEMS.Vendor.SetInventory",
      extraClass: "pus-shop-action",
      onClick: () => this.#onSetInventory()
    }));
    actions.appendChild(createRowControl({
      iconClass: "fa-solid fa-truck-ramp-box",
      titleKey: "INTERACTIVE_ITEMS.Vendor.Restock",
      extraClass: "pus-shop-action",
      onClick: () => this.#onRestock()
    }));
    row.append(actions, label, cell);   // actions sit left (margin-right:auto), All label+toggle stay right
    list.parentElement.insertBefore(row, list);
  }

  /** Save the current physical inventory as this vendor's default (overwrites any prior). GM-only. */
  async #onSetInventory() {
    dbg("vendorSheet:onSetInventory", { vendor: this.actor.id });
    const count = await saveDefaultInventory(this.actor);
    ui.notifications.info(game.i18n.format("INTERACTIVE_ITEMS.Vendor.SetInventoryDone", { count }));
  }

  /** Restock to the saved default: always add missing items/quantities; confirm before removing extras. */
  async #onRestock() {
    const diff = computeRestockDiff(this.actor);
    if ( !diff ) {
      dbg("vendorSheet:onRestock", "no default saved, bail", { vendor: this.actor.id });
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Vendor.RestockNoDefault"));
      return;
    }
    const hasExtras = diff.extraQty.length > 0 || diff.extraItems.length > 0;
    const hasAdds = diff.toCreate.length > 0 || diff.toIncrease.length > 0;
    if ( !hasExtras && !hasAdds ) {
      dbg("vendorSheet:onRestock", "already matches default", { vendor: this.actor.id });
      ui.notifications.info(game.i18n.localize("INTERACTIVE_ITEMS.Vendor.RestockNothing"));
      return;
    }
    const removeExtras = hasExtras ? await promptRestockRemoval(diff) : false;
    dbg("vendorSheet:onRestock", "applying", { vendor: this.actor.id, removeExtras, hasAdds, hasExtras });
    const summary = await applyRestock(this.actor, diff, { removeExtras });
    ui.notifications.info(game.i18n.format("INTERACTIVE_ITEMS.Vendor.RestockDone", summary));
  }

  /**
   * Work around a dnd5e sheet-prefs limitation for dotted actor sub-types.
   *
   * dnd5e's <item-list-controls> persists its sort/group choice in the user flag
   * `sheetPrefs.<actor.type>.tabs.<tab>.<sort|group>`. Our actor type is
   * "pick-up-stix.vendor"; the "." in it makes `User#setFlag` expand the key into an
   * extra nesting level that dnd5e's sheet-prefs schema then drops, so every write
   * vanishes and the `prefs` getter always reads back `undefined`. The controls
   * therefore fall back to their default mode on every click and look inert (no
   * error). Verified live: a dot-free key round-trips, the dotted one does not.
   *
   * Fix, re-applied each render (the element is recreated on every part re-render):
   *   - Reads: override the instance `prefs` getter to use a dot-free actor type.
   *   - Writes: dnd5e bound its click handler (with the dotted path) in
   *     connectedCallback, so swap each sort/group button for a clone (dropping that
   *     listener) and wire our own dot-free cycle handler.
   * Then re-init + re-apply so the saved choice is reflected in the fresh DOM.
   *
   * Scoped to the inventory control — the reported surface, and the one whose mode
   * list is published on `ItemListControlsElement.CONFIG.inventory`.
   */
  #fixListControlsPrefs() {
    const sanitize = (type) => type.replaceAll(".", "-");
    for ( const ilc of this.element.querySelectorAll('item-list-controls[for="inventory"]') ) {
      if ( !ilc.app ) continue;   // not yet initialised
      // Reads: resolve prefs under a dot-free actor type.
      Object.defineProperty(ilc, "prefs", {
        configurable: true,
        get() {
          return game.user.getFlag("dnd5e", `sheetPrefs.${sanitize(this.app.document.type)}.tabs.${this.tab}`);
        }
      });
      // Writes: replace the sort/group buttons (clone strips dnd5e's dotted-path
      // click listener) and wire our own dot-free cycle handler.
      for ( const action of ["sort", "group"] ) {
        const btn = ilc._controls?.[action];
        if ( !btn ) continue;
        const fresh = btn.cloneNode(true);
        btn.replaceWith(fresh);
        ilc._controls[action] = fresh;
        fresh.addEventListener("click", () => this.#cycleListMode(ilc, action));
      }
      // Re-init icons + re-apply layout now that prefs read the saved (dot-free) choice.
      ilc._initSorting?.();
      ilc._initGrouping?.();
      ilc._applyGrouping?.();
      dbg("vendorSheet:fixListControlsPrefs", "patched inventory controls", { tab: ilc.tab, prefs: ilc.prefs });
    }
  }

  /**
   * Cycle an <item-list-controls> sort or group mode using a dot-free prefs key —
   * mirrors dnd5e's own `_onCycleMode`, but writes a key our dotted actor type can
   * round-trip. Mode order comes from `ItemListControlsElement.CONFIG[for]`.
   */
  async #cycleListMode(ilc, action) {
    const ILC = customElements.get("item-list-controls");
    const cfg = ILC?.CONFIG?.[ilc.getAttribute("for")];
    const modes = (action === "group" ? cfg?.grouping : cfg?.sorting)?.map((m) => m.key);
    if ( !modes?.length ) { dbg("vendorSheet:cycleListMode", "no modes, bail", { action, for: ilc.getAttribute("for") }); return; }
    const type = ilc.app.document.type.replaceAll(".", "-");
    const flag = `sheetPrefs.${type}.tabs.${ilc.tab}.${action}`;
    const current = Math.max(0, modes.indexOf(game.user.getFlag("dnd5e", flag)));
    const next = modes[(current + 1) % modes.length];
    dbg("vendorSheet:cycleListMode", { action, flag, from: modes[current], to: next });
    await game.user.setFlag("dnd5e", flag, next);
    if ( action === "group" ) { ilc._initGrouping?.(); ilc._applyGrouping?.(); }
    else { ilc._initSorting?.(); ilc._applySorting?.(); }
    game.tooltip?.deactivate?.();
  }

  /**
   * Enqueue this user on open/maximize. If they're already in another vendor's queue, confirm the
   * switch first (single button; the X dismisses → stay put). The GM is never queued. Called
   * fire-and-forget from the lifecycle callbacks so the dialog never blocks render finalization.
   */
  async #requestJoin() {
    if ( game.user.isGM ) return;
    const myActor = getPlayerCandidateTokens()[0]?.actor ?? game.user.character;
    if ( !myActor ) { dbg("vendorSheet:requestJoin", "no candidate actor, skipping join"); return; }
    const others = findUserVendorQueues(myActor.id).filter(a => a.id !== this.actor.id);
    if ( !others.length ) { this.#joinQueue(myActor); return; }   // not queued elsewhere → join now
    dbg("vendorSheet:requestJoin", "queued elsewhere, confirming switch", { others: others.map(a => a.id) });
    const confirmed = await promptVendorQueueSwitch(this.actor.name, others[0].name);
    if ( confirmed ) this.#joinQueue(myActor);                     // GM-side join displaces the prior queue(s)
    else dbg("vendorSheet:requestJoin", "switch declined — staying in prior queue, not joining this one");
  }

  /** Emit a join request to the active GM (GM is never queued). */
  #joinQueue(myActor) {
    if ( game.user.isGM ) return;
    dbg("vendorSheet:joinQueue", { vendor: this.actor.id, actor: myActor.id });
    emitSocketEvent("vendorQueueJoin", { vendorActorId: this.actor.id, actorId: myActor.id });
  }

  /** A player minimized/closed this vendor sheet — dequeue them and drop their cart. */
  #leaveQueue() {
    if ( game.user.isGM ) return;
    const myActor = getPlayerCandidateTokens()[0]?.actor ?? game.user.character;
    if ( !myActor ) return;
    this.#cart.clear();                 // leaving clears my basket so nothing carries over
    dbg("vendorSheet:leaveQueue", { vendor: this.actor.id, actor: myActor.id });
    emitSocketEvent("vendorQueueLeave", { vendorActorId: this.actor.id, actorId: myActor.id });
  }

  /** The queue flag on THIS vendor changed — re-render so the strip + gating follow. */
  #onQueueChange(actor, changes) {
    if ( !this.rendered || actor.id !== this.actor.id ) return;
    if ( !foundry.utils.hasProperty(changes, "flags.pick-up-stix.shoppingQueue") ) return;
    dbg("vendorSheet:onQueueChange", { vendor: actor.id, queue: getVendorQueue(actor) });
    this.render();
  }

  /** Join (gated) once, when the sheet is first opened. */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.#requestJoin();                // fire-and-forget; may pop the switch dialog
  }

  /** Leave the queue when the window is minimized (only on a real transition). */
  async minimize() {
    const wasMinimized = this.minimized;
    await super.minimize();
    if ( !wasMinimized && this.minimized ) this.#leaveQueue();
  }

  /** Rejoin (gated) when the window is restored from minimized. */
  async maximize() {
    const wasMinimized = this.minimized;
    await super.maximize();
    if ( wasMinimized && !this.minimized ) this.#requestJoin();
  }

  /** Leave the queue on close (fires for the X button and programmatic close). */
  _onClose(options) {
    super._onClose(options);
    this.#leaveQueue();
    // The sheet instance is cached per-actor and reused on reopen, so reset the vendor-settings
    // panel to collapsed here — otherwise it reopens in whatever state it was last left in.
    this.#favorCollapsed = true;
  }

  async close(options = {}) {
    if (this.#currencyHookId !== null) { Hooks.off("updateActor", this.#currencyHookId); this.#currencyHookId = null; }
    if (this.#controlHookId !== null) { Hooks.off("controlToken", this.#controlHookId); this.#controlHookId = null; }
    if (this.#deleteItemHookId !== null) { Hooks.off("deleteItem", this.#deleteItemHookId); this.#deleteItemHookId = null; }
    if (this.#updateItemHookId !== null) { Hooks.off("updateItem", this.#updateItemHookId); this.#updateItemHookId = null; }
    if (this.#queueHookId !== null) { Hooks.off("updateActor", this.#queueHookId); this.#queueHookId = null; }
    if (this.#renderTimer) { clearTimeout(this.#renderTimer); this.#renderTimer = null; }
    return super.close(options);
  }

  #onBuyerCurrencyChange(actor, changes, options) {
    if (!this.rendered) return;
    if (options?.pickUpStix?.suppressVendorRender) return;   // our own checkout debit — skip
    if (!foundry.utils.hasProperty(changes, "system.currency")) return;
    const buyer = getPlayerCandidateTokens()[0]?.actor ?? null;
    if (!buyer || buyer.id !== actor.id) return;
    dbg("vendorSheet:buyerCurrencyChange", "re-rendering wares", { actor: actor.id });
    this.render();                             // re-runs _onRender → recomputes affordability
  }

  /**
   * An item on this vendor changed or was deleted — keep the cart honest. If it's in the cart,
   * re-run #refreshCart, whose prune drops the entry when the item has left the shop (deleted,
   * GM-hidden, or sold out) and clamps it down when stock fell below the cart quantity. The prune
   * tests the live item collection, so deletion (item gone) and hide/quantity changes (item present)
   * are both handled. Fires on every client with the sheet open, so a GM editing stock corrects each
   * player's cart too. #refreshCart only touches the DOM (no re-render), so this stays flicker-free.
   */
  #onVendorCartItemChanged(item) {
    if ( !this.rendered ) return;
    if ( !item || !this.#cart.has(item.id) ) return;                  // only in-cart items matter
    if ( item.parent && item.parent.id !== this.actor.id ) return;    // not this vendor's (when known)
    dbg("vendorSheet:cartItemChanged", { item: item.id, name: item.name });
    this.#refreshCart();
  }

  /** The GM always shops; a player shops only when their actor is at the front of the queue. */
  #canShop() {
    if ( game.user.isGM ) return true;
    const myActor = getPlayerCandidateTokens()[0]?.actor ?? game.user.character;
    if ( !myActor ) return false;
    return getVendorQueue(this.actor)[0] === myActor.id;
  }

  /** Map the queue actorIds to display rows for the strip (active = index 0). */
  #prepareQueue() {
    return getVendorQueue(this.actor).reduce((rows, actorId, i) => {
      // Find the user who owns this actor as their character.
      const user = game.users.find(u => u.character?.id === actorId);
      const character = user?.character ?? game.actors.get(actorId) ?? null;
      if ( !character ) return rows;           // actor deleted or no matching user — skip
      rows.push({
        actorId,
        name: character.name,
        img: character.img ?? "icons/svg/mystery-man.svg",
        color: user?.color?.css ?? (typeof user?.color === "string" ? user?.color : null),
        active: i === 0,
        isSelf: user?.id === game.user.id
      });
      return rows;
    }, []);
  }

  /** Vendor-settings panel collapse state — instance-only, so it always starts collapsed on open. */
  #isFavorCollapsed() {
    return this.#favorCollapsed;
  }

  /**
   * Toggle the favor panel open/closed. Tracked in an instance field (not persisted) so it always
   * starts collapsed on open, while a live toggle survives re-renders within the session. This does
   * NOT re-render — the CSS height transition animates on the live DOM (mirrors dnd5e's sidebar
   * collapse); the next full render re-applies the class from the field via `#prepareFavorContext`.
   * GM-only in practice (players never render the panel).
   */
  static #onToggleFavor(event, target) {
    const panel = target.closest(".pus-favor-panel");
    if ( !panel ) return;
    const collapsed = panel.classList.toggle("collapsed");
    target.setAttribute("aria-expanded", String(!collapsed));
    dbg("vendorSheet:onToggleFavor", { vendor: this.actor.id, collapsed });
    this.#favorCollapsed = collapsed;
  }

  /** Switch the factor list between the Type and Rarity dimensions (GM only). Re-renders the shop part. */
  static #onSettingsBy(event, target) {
    const dim = target.dataset.dimension;
    if ( dim !== "type" && dim !== "rarity" ) return;
    if ( this.#settingsBy === dim ) return;
    dbg("vendorSheet:onSettingsBy", { vendor: this.actor.id, dim });
    this.#settingsBy = dim;
    this.render();
  }

  /**
   * Expand/collapse one grouping-factor row. DOM-only so the transition is instant; the instance
   * Set records the state so a later re-render (after a flag write) re-applies it via context.
   * Clicks originating inside `.pus-factor-body` (slider / number input) are ignored so editing
   * doesn't collapse the row.
   */
  static #onToggleFactorRow(event, target) {
    if ( event.target.closest(".pus-factor-body") ) return;
    const row = target.closest(".pus-factor-row");
    if ( !row ) return;
    const id = `${row.dataset.dimension}:${row.dataset.key}`;
    const expanded = row.classList.toggle("expanded");
    target.setAttribute("aria-expanded", String(expanded));
    if ( expanded ) this.#expandedFactorRows.add(id);
    else this.#expandedFactorRows.delete(id);
    dbg("vendorSheet:onToggleFactorRow", { vendor: this.actor.id, id, expanded });
  }

  /** Per-user, per-vendor queue-panel collapse state (defaults to expanded). */
  #isQueueCollapsed() {
    const map = game.user.getFlag("pick-up-stix", "queueCollapsed") ?? {};
    return map[this.actor.id] ?? false;
  }

  /** Persist the queue-panel collapse state for this user + vendor (no actor re-render). */
  async #setQueueCollapsed(collapsed) {
    const map = { ...(game.user.getFlag("pick-up-stix", "queueCollapsed") ?? {}) };
    map[this.actor.id] = collapsed;
    dbg("vendorSheet:setQueueCollapsed", { vendor: this.actor.id, collapsed });
    await game.user.setFlag("pick-up-stix", "queueCollapsed", map);
  }

  /**
   * Toggle the queue panel open/closed. Like the favor toggle it persists to a per-user flag (no
   * re-render) so the CSS height transition runs on the live DOM — but the queue content is
   * in-flow, so expanding pushes the shop list down rather than overlaying it.
   */
  static #onToggleQueue(event, target) {
    const panel = target.closest(".pus-queue-panel");
    if ( !panel ) return;
    const collapsed = panel.classList.toggle("collapsed");
    target.setAttribute("aria-expanded", String(!collapsed));
    dbg("vendorSheet:onToggleQueue", { vendor: this.actor.id, collapsed });
    this.#setQueueCollapsed(collapsed);
  }

  /**
   * Favor panel context (GM only): current values, slider bounds, and formatted display strings.
   * Mirrors the value formatting the old header card used.
   */
  #prepareFavorContext() {
    const favor = getVendorFavor(this.actor);
    const factor = getVendorFavorFactor(this.actor);
    const sign = (v) => `${v > 0 ? "+" : ""}${v}`;
    return {
      value: favor,
      factor,
      valueDisplay: sign(favor),
      factorDisplay: `${factor}%`,
      favorMin: getFavorMin(),
      favorMax: getFavorMax(),
      factorMin: getFavorFactorMin(),
      factorMax: getFavorFactorMax(),
      collapsed: this.#isFavorCollapsed()
    };
  }

  /** GM-only context for the "Settings by" toggle + the factor list of inventory-present buckets. */
  #prepareSettingsContext() {
    const physical = this.actor.items.filter(i => getAdapter().isPhysicalItem(i));
    const groups = buildSettingsGroups(physical, this.#settingsBy);
    const maxFactor = getMaxPriceFactor();
    const globalFactor = getVendorGlobalFactor(this.actor);
    return {
      by: this.#settingsBy,
      dimensions: [
        { key: "type",   label: "INTERACTIVE_ITEMS.Vendor.SettingsBy.Type",   active: this.#settingsBy === "type" },
        { key: "rarity", label: "INTERACTIVE_ITEMS.Vendor.SettingsBy.Rarity", active: this.#settingsBy === "rarity" }
      ],
      maxFactor,
      globalFactor,
      globalFactorDisplay: (globalFactor / 100).toFixed(2),
      rows: groups.map(g => {
        const factor = getVendorGroupingFactor(this.actor, this.#settingsBy, g.key);
        return {
          dimension: this.#settingsBy,
          key: g.key,
          label: g.label,
          count: g.count,
          factor,
          factorDisplay: (factor / 100).toFixed(2),
          // Reuse the ware-row rarity palette to tint the group name when grouped by rarity.
          colorClass: this.#settingsBy === "rarity" ? `pus-rarity-${g.key}` : "",
          expanded: this.#expandedFactorRows.has(`${this.#settingsBy}:${g.key}`)
        };
      })
    };
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( partId === "shop" ) {
      context.shop = this.#prepareShop();
      context.isGM = game.user.isGM;
      context.queue = this.#prepareQueue();
      context.canShop = this.#canShop();
      if ( context.isGM ) context.favor = this.#prepareFavorContext();
      if ( context.isGM ) context.settings = this.#prepareSettingsContext();
      if ( context.isGM ) context.queueCollapsed = this.#isQueueCollapsed();
    }
    if ( partId === "header" ) {
      // Player storefront header shows the actor's public biography below the name, enriched
      // so links/rolls render. Reactive: editing it (GM bio tab) re-renders the sheet.
      const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
      context.publicBio = await TE.enrichHTML(this.actor.system?.details?.biography?.public ?? "",
        { secrets: false, relativeTo: this.actor });
      context.queue = this.#prepareQueue();
    }
    return context;
  }

  /**
   * Shop-listing predicate: physical, in stock, and not GM-hidden (absent flag = visible). Shared
   * by #prepareShop (what the storefront lists) and the cart prune (#refreshCart), so an item that's
   * deleted, hidden, or sold out is dropped from the cart in lockstep with leaving the storefront.
   */
  #isShopEligible(item) {
    const adapter = getAdapter();
    return adapter.isPhysicalItem(item)
      && adapter.getItemQuantity(item) > 0
      && item.getFlag("pick-up-stix", "shopVisible") !== false;
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
    const items = this.actor.items.filter(i => this.#isShopEligible(i));
    return buildShop(items, this.#groupingId);
  }

  static #onToggleCart(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if ( !itemId ) return;
    if ( this.#cart.has(itemId) ) this.#cart.delete(itemId);
    else this.#cart.set(itemId, 1);
    dbg("vendorSheet:onToggleCart", { itemId, inCart: this.#cart.has(itemId), size: this.#cart.size });
    this.#refreshCart();
  }

  /** Trash button in the cart footer — empty the basket without buying. */
  static #onClearCart(event, target) {
    if ( !this.#cart.size ) return;
    dbg("vendorSheet:onClearCart", { size: this.#cart.size });
    this.#cart.clear();
    this.#refreshCart();
  }

  static async #onCheckoutCart(event, target) {
    const cartItems = [...this.#cart.entries()];   // [[itemId, qty], ...]
    if ( !cartItems.length ) return;
    const buyer = getPlayerCandidateTokens()[0]?.actor ?? null;
    if ( !buyer ) {
      dbg("vendorSheet:onCheckoutCart", "no buyer, bail");
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoBuyer"));
      return;
    }

    // Pre-flight: total the cart and check buyer wealth before dispatching.
    // Settlement feasibility (change availability) is the GM-side authoritative gate in purchaseCart.
    const adapter = getAdapter();
    const totalCp = cartItems.reduce((sum, [id, qty]) => {
      const item = this.actor.items.get(id);
      return sum + (item ? adapter.getItemChargeCp(item, qty) : 0);
    }, 0);
    if ( totalCp > 0 && adapter.getActorWealthCp(buyer) < totalCp ) {
      dbg("vendorSheet:onCheckoutCart", "buyer lacks wealth, bail", { totalCp, buyer: buyer.id });
      ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotEnoughCoin"));
      return;
    }

    // Resolve names NOW — the GM mutates vendor stock during the purchase, so the rows may be gone
    // by the time the self-notify fires. Drop entries whose item vanished (GM notify is authoritative).
    const lines = cartItems.reduce((acc, [id, qty]) => {
      const name = this.actor.items.get(id)?.name;
      if ( name ) acc.push({ name, qty });
      return acc;
    }, []);
    const totalUnits = cartItems.reduce((sum, [, qty]) => sum + qty, 0);
    dbg("vendorSheet:onCheckoutCart", { items: cartItems.length, units: totalUnits, buyer: buyer.id, vendor: this.actor.id });
    // Empty the cart and hide its footer immediately via direct DOM (no re-render). The single
    // vendor-credit write at the end of the purchase is what re-renders the shop, exactly once.
    this.#cart.clear();
    this.#refreshCart();
    await dispatchGM(
      "purchaseCart",
      { vendorActorId: this.actor.id, cartItems, buyerActorId: buyer.id },
      async () => purchaseCart(this.actor.id, cartItems, buyer.id)
    );
    // Buyer self-notifies one per distinct item (×N when qty > 1); the GM gets the attributed
    // per-item set from purchaseCart.
    if ( !game.user.isGM ) for ( const { name, qty } of lines ) notifyPurchase(name, this.actor.name, qty);
  }

  /**
   * Single live-update pass for cart state, basket toggle active/disabled states,
   * per-row buy button disabled states, and the footer visibility + total.
   * Called from `_onRender` (after `await super._onRender` so it overrides core
   * _toggleDisabled) and directly from `#onToggleCart` (avoids a full re-render).
   * The `#cart` Set survives re-renders so toggled state persists across currency
   * updates and selection changes.
   */
  #refreshCart() {
    if ( !this.#canShop() ) { this.#cart.clear(); return; }   // waiting player: controls not rendered
    const adapter = getAdapter();
    const buyer = getPlayerCandidateTokens()[0]?.actor ?? null;
    const wealthCp = buyer ? adapter.getActorWealthCp(buyer) : 0;

    // Keep the cart honest against live stock: drop ids that have left the shop (deleted, hidden,
    // or sold out) and clamp any survivor down to its current stock (a stock drop below the cart
    // quantity must rebalance). Then total the rest and count the units being purchased.
    let cartCp = 0, cartUnits = 0;
    for ( const [id, qty] of [...this.#cart] ) {
      const item = this.actor.items.get(id);
      if ( !item || !this.#isShopEligible(item) ) { this.#cart.delete(id); continue; }
      const stock = adapter.getItemQuantity(item);
      const q = Math.min(qty, stock);            // balance to available stock
      if ( q !== qty ) this.#cart.set(id, q);
      cartCp += adapter.getItemChargeCp(item, q);
      cartUnits += q;
    }
    const hasCart = this.#cart.size > 0;

    for ( const row of this.element.querySelectorAll(".shop-ware") ) {
      const id = row.dataset.itemId;
      const item = this.actor.items.get(id);
      if ( !item ) continue;
      const inCart = this.#cart.has(id);
      const unitCp = adapter.getItemChargeCp(item, 1);
      const stock = adapter.getItemQuantity(item);

      const basket = row.querySelector(".shop-cart-toggle");
      if ( basket ) {
        basket.classList.toggle("active", inCart);
        // Removable when in cart; addable (one unit) only if it still fits the buyer's purse.
        basket.disabled = !inCart && (!buyer || (cartCp + unitCp) > wealthCp);
      }
      const buy = row.querySelector(".vendor-buy");
      if ( buy ) buy.disabled = hasCart || !(buyer && adapter.canAfford(buyer, item, 1));

      // Quantity input (multi-stock wares): visible only while the item is in the cart;
      // value mirrors the cart quantity, max tracks the live stock.
      const qtyWrap = row.querySelector(".shop-ware-qty");
      if ( qtyWrap ) {
        qtyWrap.classList.toggle("active", inCart);
        const qtyVal = qtyWrap.querySelector(".qty-val");
        if ( qtyVal ) {
          qtyVal.disabled = !inCart;   // re-enable for non-owners (core _toggleDisabled disabled it)
          qtyVal.max = String(stock);
          if ( inCart ) qtyVal.value = String(this.#cart.get(id));
        }
        for ( const step of qtyWrap.querySelectorAll(".qty-step") ) step.disabled = !inCart;
      }
    }

    // Footer: total + unit count, visibility animation, and checkout enable/disable.
    const footer = this.element.querySelector(".shop-cart-footer");
    if ( footer ) {
      footer.classList.toggle("active", hasCart);
      const totalEl = footer.querySelector(".cart-total");
      if ( totalEl ) totalEl.textContent = this.#formatCp(cartCp);
      const countEl = footer.querySelector(".cart-count");
      if ( countEl ) countEl.textContent = String(cartUnits);
      const checkout = footer.querySelector(".cart-checkout");
      if ( checkout ) checkout.disabled = !(hasCart && buyer && cartCp <= wealthCp);
    }
  }

  /** Cart quantity input change (multi-stock wares) — route the typed value through #setCartQty. */
  #onCartQtyChange(event) {
    const input = event.target?.closest?.(".shop-ware-qty .qty-val");
    if ( !input ) return;
    const id = input.closest("[data-item-id]")?.dataset.itemId;
    if ( !id ) return;
    this.#setCartQty(id, Math.round(Number(input.value) || 1));
  }

  /**
   * Clamp `requested` to [1, stock], then down further if the new cart total would exceed the
   * buyer's treasure (the unaffordable update is not allowed), set the cart, and re-run
   * #refreshCart so the input value + footer total/count follow.
   */
  #setCartQty(id, requested) {
    if ( !this.#cart.has(id) ) return;
    const item = this.actor.items.get(id);
    if ( !item ) return;
    const adapter = getAdapter();
    const stock = adapter.getItemQuantity(item);
    let qty = Math.max(1, Math.min(stock, Math.round(Number(requested) || 1)));

    // Affordability: sum the OTHER cart items, then clamp this item's qty down until the whole
    // cart fits the buyer's treasure. (qty >= 1 always fits — adding it was already gated.)
    const buyer = getPlayerCandidateTokens()[0]?.actor ?? null;
    const wealthCp = buyer ? adapter.getActorWealthCp(buyer) : 0;
    let otherCp = 0;
    for ( const [otherId, otherQty] of this.#cart ) {
      if ( otherId === id ) continue;
      const it = this.actor.items.get(otherId);
      if ( it ) otherCp += adapter.getItemChargeCp(it, otherQty);
    }
    while ( qty > 1 && otherCp + adapter.getItemChargeCp(item, qty) > wealthCp ) qty--;

    dbg("vendorSheet:setCartQty", { id, requested, qty, stock });
    this.#cart.set(id, qty);
    this.#refreshCart();
  }

  /** A −/+ stepper button: adjust the in-cart quantity by its data-step. */
  static #onStepCartQty(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if ( !id || !this.#cart.has(id) ) return;
    const step = Number(target.dataset.step) || 0;
    this.#setCartQty(id, (this.#cart.get(id) ?? 1) + step);
  }

  /** Format a copper amount as a short coin string, e.g. 3060 → "30 gp 6 sp". */
  #formatCp(cp) {
    const conv = getAdapter().currency;
    if ( !conv ) return `${cp}`;
    const { coins } = conv.decompose(cp);
    const parts = conv.changeDenoms.filter(d => coins[d]).map(d => `${coins[d]} ${d}`);
    return parts.join(" ") || `0 ${conv.defaultDenom}`;
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
    const chargeCp = adapter.getItemChargeCp(item, qty);
    if ( chargeCp > 0 && !adapter.planSettlement(buyer, item.parent, chargeCp) ) {
      dbg("vendorSheet:onBuyWare", "no change available, bail", { item: item.id, buyer: buyer.id, qty });
      ui.notifications.warn(game.i18n.format("INTERACTIVE_ITEMS.Notify.NoChange", { name: item.name }));
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
    if ( !game.user.isGM ) notifyPurchase(item.name, this.actor.name, qty);  // buyer self-notifies
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
