import { getAdapter } from "../index.mjs";
import { getPlayerCandidateTokens, purchaseItem, purchaseCart } from "../../transfer/ItemTransfer.mjs";
import { dispatchGM } from "../../utils/gmDispatch.mjs";
import { notifyPurchase, notifyPurchaseCart } from "../../utils/notify.mjs";
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
      checkoutCart: Dnd5eVendorSheet.#onCheckoutCart,
      stepCartQty: Dnd5eVendorSheet.#onStepCartQty,
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
    this.#injectPortraitClip();                 // wrap the portrait so the figure masks at the frame
    this.#repositionEditToggle();               // move dnd5e's edit toggle next to the XP badge
    // Re-evaluate cart state and buy-button gating after core _toggleDisabled has run.
    // #refreshCart owns the disabled state for both basket toggles and buy buttons.
    this.#refreshCart();
    this.#refreshSubtitleTooltips();
    this.#injectInventoryShopToggles();
    this.#injectInventoryShopAllToggle();
    if (this.#currencyHookId === null) {       // register the live-update hooks once
      this.#currencyHookId = Hooks.on("updateActor", this.#onBuyerCurrencyChange.bind(this));
      // The buyer depends on the controlled token, so re-evaluate on selection changes too.
      this.#controlHookId = Hooks.on("controlToken", () => { if (this.rendered) this.render(); });
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
      iconClass: "fa-solid fa-box-arrow-down-arrow-up",
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
    row.append(label, cell);
    list.parentElement.insertBefore(row, list);
  }

  async close(options = {}) {
    if (this.#currencyHookId !== null) { Hooks.off("updateActor", this.#currencyHookId); this.#currencyHookId = null; }
    if (this.#controlHookId !== null) { Hooks.off("controlToken", this.#controlHookId); this.#controlHookId = null; }
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

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( partId === "shop" ) {
      context.shop = this.#prepareShop();
      context.isGM = game.user.isGM;
    }
    if ( partId === "header" ) {
      // Player storefront header shows the actor's public biography below the name, enriched
      // so links/rolls render. Reactive: editing it (GM bio tab) re-renders the sheet.
      const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
      context.publicBio = await TE.enrichHTML(this.actor.system?.details?.biography?.public ?? "",
        { secrets: false, relativeTo: this.actor });
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

  static #onToggleCart(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if ( !itemId ) return;
    if ( this.#cart.has(itemId) ) this.#cart.delete(itemId);
    else this.#cart.set(itemId, 1);
    dbg("vendorSheet:onToggleCart", { itemId, inCart: this.#cart.has(itemId), size: this.#cart.size });
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
    if ( !game.user.isGM ) notifyPurchaseCart(totalUnits, this.actor.name);
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
    const adapter = getAdapter();
    const buyer = getPlayerCandidateTokens()[0]?.actor ?? null;
    const wealthCp = buyer ? adapter.getActorWealthCp(buyer) : 0;

    // Prune cart ids no longer present (sold out / hidden); total the rest at each item's
    // cart quantity, and count the total units being purchased.
    let cartCp = 0, cartUnits = 0;
    for ( const [id, qty] of [...this.#cart] ) {
      const item = this.actor.items.get(id);
      if ( !item ) { this.#cart.delete(id); continue; }
      cartCp += adapter.getItemChargeCp(item, qty);
      cartUnits += qty;
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
    const gp = Math.floor(cp / 100), sp = Math.floor((cp % 100) / 10), c = cp % 10;
    return [gp && `${gp} gp`, sp && `${sp} sp`, c && `${c} cp`].filter(Boolean).join(" ") || "0 gp";
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
