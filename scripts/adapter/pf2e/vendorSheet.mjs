/**
 * Pf2eVendorSheet — ApplicationV1 sheet for the `pick-up-stix.vendor` sub-type.
 *
 * Extends pf2e's ActorSheetPF2e and REUSES pf2e's native inventory machinery so
 * the Inventory tab looks and behaves exactly like a pf2e actor's inventory
 * (purple section bands, currency row, search, item rows with the +/qty/delete
 * controls — the `+` creates an item of that section's type). It then adds a
 * read-only Shop tab. The vendor stays a LootPF2e-backed actor (NOT a full NPC),
 * so we patch the IWR attributes pf2e's getData sorts (LootPF2e has none).
 *
 * ActorSheetPF2e is not exported by pf2e, so the class is produced by a factory
 * called from `registerVendorSheet()` with the runtime-resolved base class.
 */

import { getAdapter } from "../index.mjs";
import { dbg } from "../../utils/debugLog.mjs";
import { buildShopFromSections, buildSettingsGroups } from "./shopGrouping.mjs";
import { getPlayerCandidateTokens, purchaseItem, purchaseCart } from "../../transfer/ItemTransfer.mjs";
import { dispatchGM } from "../../utils/gmDispatch.mjs";
import { notifyPurchase } from "../../utils/notify.mjs";
import { emitSocketEvent } from "../../socket/SocketHandler.mjs";
import { getVendorQueue, findUserVendorQueues, promptVendorQueueSwitch } from "../../utils/vendorQueue.mjs";
import {
  getVendorFavor, getVendorFavorFactor, getFavorMin, getFavorMax,
  getFavorFactorMin, getFavorFactorMax, getFavorFactorDefault,
  getVendorGroupingFactor, getVendorGlobalFactor, getMaxPriceFactor
} from "../../utils/vendorPricing.mjs";
import { saveDefaultInventory, computeRestockDiff, applyRestock, promptRestockRemoval }
  from "../../utils/vendorInventory.mjs";
import { createRowControl } from "../../utils/domButtons.mjs";

/**
 * @param {typeof foundry.appv1.sheets.ActorSheet} ActorSheetPF2e
 * @returns {typeof foundry.appv1.sheets.ActorSheet}
 */
export function definePf2eVendorSheet(ActorSheetPF2e) {

  return class Pf2eVendorSheet extends ActorSheetPF2e {

    /** Shopping cart: itemId → quantity. Survives re-renders (the app persists). */
    #cart = new Map();

    /** Once-per-open guard for the gated queue join (reset in close so reopen re-joins). */
    #hasJoinedQueue = false;

    /** GM settings panel: which dimension the per-bucket factor list edits ("type" | "rarity"). */
    #settingsBy = "type";
    /** `${dimension}:${key}` factor rows currently expanded (survives re-render). */
    #expandedFactorRows = new Set();
    /** Settings panel starts collapsed on every open; live toggles survive re-renders within a session. */
    #favorCollapsed = true;
    /** ResizeObserver that keeps the settings backdrop sized to the list below it (GM only). */
    #backdropObserver = null;

    /** `controlToken` hook id — re-evaluates buyer affordability when token selection changes. */
    #controlHookId = null;

    /** Ware filters (view-only, sheet-local). "" = all rarities; affordable hides what the buyer can't buy. */
    #filterRarity = "";
    #filterAffordable = false;

    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        classes: ["pick-up-stix", "pf2e", "sheet", "actor", "vendor-sheet"],
        template: "modules/pick-up-stix/templates/vendor/pf2e-vendor.hbs",
        width: 700,
        height: 720,
        scrollY: [".inventory-list", ".tab.shop"],
        tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "inventory" }]
      });
    }

    get title() {
      return `${game.i18n.localize("TYPES.Actor.pick-up-stix.vendor")}: ${this.actor.name}`;
    }

    /**
     * Reuse pf2e's full sheet context (inventory sections, currency, traits,
     * editable/owner flags) via super.getData, then add our Shop tab data.
     *
     * `ActorSheetPF2e.getData` sorts `system.attributes.{immunities,weaknesses,
     * resistances}` — built for creatures. Our LootPF2e-backed vendor has none
     * (`LootPF2e.prepareBaseData` sets `attributes = {}`), so a model stub would
     * be wiped; seed them on the prepared data right before super reads them.
     * Transient — re-seeded on every render.
     */
    async getData(options = this.options) {
      const attrs = (this.actor.system.attributes ??= {});
      attrs.immunities ??= [];
      attrs.weaknesses ??= [];
      attrs.resistances ??= [];

      const context = await super.getData(options);
      context.isGM = game.user.isGM;
      // Buy/cart controls RENDER for every viewer (GM + players) so a waiting shopper
      // can see what they'll be able to do. They're only ENABLED for the active
      // shopper — the GM, or the player at the front of the queue; #refreshCart owns
      // the disabled state and drops a waiting shopper's cart.
      context.canShop = true;
      // Shopping queue strip — GM: collapsible panel; players: plain strip. Both
      // see who's shopping now and who's waiting.
      context.queue = this.#prepareQueue();
      context.queueCollapsed = this.#isQueueCollapsed();
      // Show the VALUE column on every inventory section (matches the NPC look;
      // base prepareInventory only sets this true for npc/loot/party types).
      if (context.inventory) context.inventory.showValueAlways = true;
      // Build the Shop from the same prepared inventory sections, so the Shop
      // groups use the identical categories/labels/order as the Inventory tab.
      // The Shop tab lists only wares actually in the shop (shopVisible !== false)
      // for GM and players alike; the GM manages visibility from the Inventory tab.
      // The rarity filter is applied server-side (re-render); affordable is client-side.
      context.shop = buildShopFromSections(context.inventory?.sections ?? [], undefined,
        { includeHidden: false, rarity: this.#filterRarity });
      // Ware filters (all viewers).
      context.filters = this.#prepareFilters();
      // GM-only pricing settings panel (favor sliders + per-bucket price factors)
      // and shop-management state (the All-visible master toggle).
      if (context.isGM) {
        context.favor = this.#prepareFavorContext();
        context.settings = this.#prepareSettingsContext();
        const physical = this.actor.items.filter(i => getAdapter().isPhysicalItem(i));
        context.allVisible = physical.length > 0
          && physical.every(i => i.getFlag("pick-up-stix", "shopVisible") !== false);
      }
      dbg("pf2e-vendor-sheet:getData", {
        actor: this.actor?.name, isGM: context.isGM, active: this.#isActiveShopper(), queue: context.queue.length
      });
      return context;
    }

    /**
     * Reuse pf2e's native inventory listeners (create/qty/delete/identify/search/
     * drag-drop) via super, then add our header image-edit handler. Drag-to-stock
     * is handled by pf2e's native `_onDropItem` (the module's container-drop gate
     * passes through for non-loot-type, non-container drops).
     */
    activateListeners(html) {
      super.activateListeners(html);

      html.find("[data-action='editActorImage']").on("click", (event) => {
        event.preventDefault();
        const fp = new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: this.actor.img,
          callback: (path) => this.actor.update({ img: path, "prototypeToken.texture.src": path })
        });
        fp.render(true);
      });

      // Non-GM shoppers have no Inventory tab — default them to the Shop tab.
      if (!game.user.isGM) this._tabs?.[0]?.activate?.("shop");

      // The shop renders inside a not-editable form for non-owner shoppers, so
      // Foundry disables its controls — re-enable them, then bind.
      html.find(".vendor-buy, .shop-cart-toggle, .cart-clear, .cart-checkout, .qty-step, .qty-val, " +
        ".pus-filter-rarity, .pus-filter-affordable, .pus-filter-reset")
        .prop("disabled", false);
      html.find(".vendor-buy").on("click", this.#onBuyWare.bind(this));
      html.find(".shop-cart-toggle").on("click", this.#onToggleCart.bind(this));
      html.find(".cart-clear").on("click", this.#onClearCart.bind(this));
      html.find(".cart-checkout").on("click", this.#onCheckoutCart.bind(this));
      html.find(".qty-step").on("click", this.#onStepCartQty.bind(this));
      html.find(".qty-val").on("change", this.#onCartQtyChange.bind(this));

      // Click a ware row (outside its controls) to open the item's sheet (read-only for players).
      html.find(".tab.shop .pus-shop-list li[data-item-id]").on("click", this.#onWareRowClick.bind(this));

      // Ware filters (all viewers): rarity → re-render (server-side); affordable → DOM filter; reset → both.
      // Affordable is a button (not a form input) so pf2e's submit-on-change never re-renders over it.
      html.find(".pus-filter-rarity").on("change", this.#onFilterRarityChange.bind(this));
      html.find(".pus-filter-affordable").on("click", this.#onFilterAffordableChange.bind(this));
      html.find(".pus-filter-reset").on("click", this.#onResetFilters.bind(this));

      // GM queue-panel collapse toggle (DOM-only; the CSS height transition runs live).
      html.find(".pus-queue-panel .pus-collapse-bar").on("click", this.#onToggleQueuePanel.bind(this));

      // GM settings panel: collapse toggle, settings-by switch, factor-row expand.
      html.find(".pus-favor-panel .pus-collapse-bar").on("click", this.#onToggleFavorPanel.bind(this));
      html.find(".pus-settings-by-btn").on("click", this.#onSettingsBy.bind(this));
      html.find(".pus-factor-head").on("click", this.#onToggleFactorRow.bind(this));
      // Slider/number wiring + out-of-bounds flag clamping (all GM-guarded internally).
      this.#clampFavorFlags();
      this.#wireFavorControls();
      this.#wireSettingsControls();
      this.#wireSettingsBackdrop();

      // GM shop-management: the All master toggle + Save-default / Restock (toolbar
      // on the Inventory tab), plus a per-row shop-visibility toggle injected into
      // each native inventory row. All isGM-gated.
      html.find(".pus-shop-all-toggle").on("click", this.#onToggleAllShop.bind(this));
      html.find(".pus-shop-save").on("click", this.#onSetInventory.bind(this));
      html.find(".pus-shop-restock").on("click", this.#onRestock.bind(this));
      this.#injectInventoryShopToggles();

      // Join the vendor's queue once per open (gated against being queued elsewhere).
      // A V1 DocumentSheet auto-re-renders on any update to its actor, so the queue
      // flag changing re-runs getData/canShop on every client with the sheet open —
      // no explicit queue hook needed (unlike the dnd5e V2 sheet).
      if (!this.#hasJoinedQueue) {
        this.#hasJoinedQueue = true;
        this.#requestJoin();   // fire-and-forget; may pop the switch dialog
      }

      // The buyer is resolved from the controlled token; the vendor sheet does NOT
      // auto-re-render when token selection changes (the buyer is a different
      // document), so refresh the buy/cart disabled state AND re-apply the affordable
      // filter for the new buyer on controlToken. Registered once; torn down in close().
      if (this.#controlHookId === null) {
        this.#controlHookId = Hooks.on("controlToken", () => {
          if (!this.rendered) return;
          this.#refreshCart();
          this.#applyAffordableFilter();
        });
      }

      // Sync basket/buy/qty/footer states against the (re-render-surviving) cart,
      // then apply the client-side affordable filter (the rarity filter is baked in
      // server-side via getData).
      this.#refreshCart();
      this.#applyAffordableFilter();
    }

    /**
     * The buyer actor for this viewer: their controlled/scene token's actor, else their assigned
     * character. The character fallback matters when a player has no token on the current scene —
     * without it the buyer is null and every buy/cart control (even a free 0-cost ware) disables.
     * Mirrors the resolution in #isActiveShopper.
     */
    #resolveBuyer() {
      return getPlayerCandidateTokens()[0]?.actor ?? game.user.character ?? null;
    }

    /**
     * Left-clicking a ware row (anywhere but its controls) opens the item's sheet.
     * Players don't own the vendor's items, so Foundry renders the sheet read-only
     * for them; the GM gets the normal editable sheet.
     */
    #onWareRowClick(event) {
      // The basket/buy/visibility/qty controls have their own handlers — ignore those.
      if (event.target.closest(".col-controls, .shop-ware-qty")) return;
      const id = event.currentTarget.dataset.itemId;
      const item = this.actor.items.get(id);
      if (!item) { dbg("pf2e-vendor-sheet:onWareRowClick", "no item", { id }); return; }
      dbg("pf2e-vendor-sheet:onWareRowClick", "opening item sheet", { item: id, name: item.name });
      item.sheet.render(true);
    }

    /** Buy one unit of the clicked ware → socket → GM-side purchaseItem. */
    async #onBuyWare(event) {
      event.preventDefault();
      if (!this.#isActiveShopper()) { dbg("pf2e-vendor-sheet:onBuyWare", "not active shopper, bail"); return; }
      const itemId = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item) { dbg("pf2e-vendor-sheet:onBuyWare", "no item for row", { itemId }); return; }

      const qty = 1; // vendors sell one unit per Buy click (cart handles multiples)
      // Buyer = first pickup candidate (controlled non-interactive token, else
      // the assigned character's scene token) — same resolution as the pickup flow.
      const buyer = this.#resolveBuyer();
      if (!buyer) {
        dbg("pf2e-vendor-sheet:onBuyWare", "no buyer, bail");
        ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoBuyer"));
        return;
      }

      const adapter = getAdapter();
      if (!adapter.canAfford(buyer, item, qty)) {
        dbg("pf2e-vendor-sheet:onBuyWare", "cannot afford, bail", { item: item.id, buyer: buyer.id });
        ui.notifications.warn(game.i18n.format("INTERACTIVE_ITEMS.Notify.NotEnoughCoin", { name: item.name }));
        return;
      }
      const chargeCp = adapter.getItemChargeCp(item, qty);
      if (chargeCp > 0 && !adapter.planSettlement(buyer, item.parent, chargeCp)) {
        dbg("pf2e-vendor-sheet:onBuyWare", "no change available, bail", { item: item.id, buyer: buyer.id });
        ui.notifications.warn(game.i18n.format("INTERACTIVE_ITEMS.Notify.NoChange", { name: item.name }));
        return;
      }

      dbg("pf2e-vendor-sheet:onBuyWare", "dispatching purchase", {
        vendor: this.actor.id, item: item.id, buyer: buyer.id, qty
      });
      await dispatchGM(
        "purchaseItem",
        { vendorActorId: this.actor.id, itemId: item.id, buyerActorId: buyer.id, quantity: qty },
        async () => purchaseItem(this.actor.id, item.id, buyer.id, qty)
      );
      if (!game.user.isGM) notifyPurchase(item.name, this.actor.name, qty); // buyer self-notifies
    }

    /* ------------------------------- Cart ------------------------------- */

    /** Basket toggle on a row — add (qty 1) or remove the ware from the cart. */
    #onToggleCart(event) {
      if (!this.#isActiveShopper()) { dbg("pf2e-vendor-sheet:onToggleCart", "not active shopper, bail"); return; }
      const id = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (!id) return;
      if (this.#cart.has(id)) this.#cart.delete(id);
      else this.#cart.set(id, 1);
      dbg("pf2e-vendor-sheet:onToggleCart", { id, inCart: this.#cart.has(id), size: this.#cart.size });
      this.#refreshCart();
    }

    /** Trash button in the cart footer — empty the basket without buying. */
    #onClearCart() {
      if (!this.#cart.size) return;
      dbg("pf2e-vendor-sheet:onClearCart", { size: this.#cart.size });
      this.#cart.clear();
      this.#refreshCart();
    }

    /** A −/+ stepper on an in-cart multi-stock ware. */
    #onStepCartQty(event) {
      const id = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (!id || !this.#cart.has(id)) return;
      const step = Number(event.currentTarget.dataset.step) || 0;
      this.#setCartQty(id, (this.#cart.get(id) ?? 1) + step);
    }

    /** Typed cart quantity change. */
    #onCartQtyChange(event) {
      const input = event.currentTarget;
      const id = input.closest("[data-item-id]")?.dataset.itemId;
      if (!id) return;
      this.#setCartQty(id, Math.round(Number(input.value) || 1));
    }

    /** Clamp `requested` to [1, stock], then down until the whole cart fits the buyer. */
    #setCartQty(id, requested) {
      if (!this.#cart.has(id)) return;
      const item = this.actor.items.get(id);
      if (!item) return;
      const adapter = getAdapter();
      const stock = adapter.getItemQuantity(item);
      let qty = Math.max(1, Math.min(stock, Math.round(Number(requested) || 1)));

      const buyer = this.#resolveBuyer();
      const wealthCp = buyer ? adapter.getActorWealthCp(buyer) : 0;
      let otherCp = 0;
      for (const [otherId, otherQty] of this.#cart) {
        if (otherId === id) continue;
        const it = this.actor.items.get(otherId);
        if (it) otherCp += adapter.getItemChargeCp(it, otherQty);
      }
      while (qty > 1 && otherCp + adapter.getItemChargeCp(item, qty) > wealthCp) qty--;

      dbg("pf2e-vendor-sheet:setCartQty", { id, requested, qty, stock });
      this.#cart.set(id, qty);
      this.#refreshCart();
    }

    /** Checkout the whole cart as one batched transaction → GM-side purchaseCart. */
    async #onCheckoutCart() {
      const cartItems = [...this.#cart.entries()]; // [[itemId, qty], ...]
      if (!cartItems.length) return;
      const buyer = this.#resolveBuyer();
      if (!buyer) {
        ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NoBuyer"));
        return;
      }

      const adapter = getAdapter();
      const totalCp = cartItems.reduce((sum, [id, qty]) => {
        const item = this.actor.items.get(id);
        return sum + (item ? adapter.getItemChargeCp(item, qty) : 0);
      }, 0);
      if (totalCp > 0 && adapter.getActorWealthCp(buyer) < totalCp) {
        ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.NotEnoughCoin"));
        return;
      }

      // Resolve names now — the GM mutates stock during the purchase, so rows may
      // be gone by the time the self-notify fires.
      const lines = cartItems.reduce((acc, [id, qty]) => {
        const name = this.actor.items.get(id)?.name;
        if (name) acc.push({ name, qty });
        return acc;
      }, []);
      dbg("pf2e-vendor-sheet:onCheckoutCart", { items: cartItems.length, buyer: buyer.id, vendor: this.actor.id });
      this.#cart.clear();
      this.#refreshCart();
      await dispatchGM(
        "purchaseCart",
        { vendorActorId: this.actor.id, cartItems, buyerActorId: buyer.id },
        async () => purchaseCart(this.actor.id, cartItems, buyer.id)
      );
      if (!game.user.isGM) for (const { name, qty } of lines) notifyPurchase(name, this.actor.name, qty);
    }

    /** Format a copper amount as a short coin string (e.g. 3060 → "30 gp 6 sp"). */
    #formatCp(cp) {
      const conv = getAdapter().currency;
      if (!conv) return `${cp}`;
      const { coins } = conv.decompose(cp);
      const parts = conv.changeDenoms.filter(d => coins[d]).map(d => `${coins[d]} ${d}`);
      return parts.join(" ") || `0 ${conv.defaultDenom}`;
    }

    /**
     * Single DOM pass: clamp the cart to live stock, then update each row's
     * basket/buy/qty states and the footer total/count/checkout. Called after
     * every cart mutation and once per render (the cart survives re-renders).
     */
    #refreshCart() {
      const root = this.element?.[0] ?? this.element;
      if (!root) return;

      // Waiting shopper (a non-GM player not at the front of the queue): the buy/cart
      // controls stay in the DOM but disabled, and any in-progress cart is dropped.
      // Reset the footer and bail before the active-shopper pricing pass.
      if (!this.#isActiveShopper()) {
        this.#cart.clear();
        for (const el of root.querySelectorAll(".vendor-buy, .shop-cart-toggle, .cart-checkout, .cart-clear, .qty-step, .qty-val")) {
          el.disabled = true;
        }
        for (const el of root.querySelectorAll(".shop-cart-toggle.active, .shop-ware-qty.active")) el.classList.remove("active");
        const footer = root.querySelector(".shop-cart-footer");
        if (footer) {
          footer.classList.remove("active");
          const totalEl = footer.querySelector(".cart-total");
          if (totalEl) totalEl.textContent = this.#formatCp(0);
          const countEl = footer.querySelector(".cart-count");
          if (countEl) countEl.textContent = "0";
        }
        dbg("pf2e-vendor-sheet:refreshCart", "waiting shopper — controls disabled");
        return;
      }

      const adapter = getAdapter();
      const buyer = this.#resolveBuyer();
      const wealthCp = buyer ? adapter.getActorWealthCp(buyer) : 0;

      // Drop sold-out / removed ids; clamp survivors to live stock.
      let cartCp = 0, cartUnits = 0;
      for (const [id, qty] of [...this.#cart]) {
        const item = this.actor.items.get(id);
        if (!item) { this.#cart.delete(id); continue; }
        const stock = adapter.getItemQuantity(item);
        const q = Math.min(qty, stock);
        if (q !== qty) this.#cart.set(id, q);
        cartCp += adapter.getItemChargeCp(item, q);
        cartUnits += q;
      }
      const hasCart = this.#cart.size > 0;

      for (const row of root.querySelectorAll(".tab.shop li[data-item-id]")) {
        const id = row.dataset.itemId;
        const item = this.actor.items.get(id);
        if (!item) continue;
        const inCart = this.#cart.has(id);
        const unitCp = adapter.getItemChargeCp(item, 1);
        const stock = adapter.getItemQuantity(item);

        const basket = row.querySelector(".shop-cart-toggle");
        if (basket) {
          basket.classList.toggle("active", inCart);
          // Removable when in cart; addable only if one more unit still fits.
          basket.disabled = !inCart && (!buyer || (cartCp + unitCp) > wealthCp);
        }
        const buy = row.querySelector(".vendor-buy");
        if (buy) buy.disabled = hasCart || !(buyer && adapter.canAfford(buyer, item, 1));

        const qtyWrap = row.querySelector(".shop-ware-qty");
        if (qtyWrap) {
          qtyWrap.classList.toggle("active", inCart);
          const qtyVal = qtyWrap.querySelector(".qty-val");
          if (qtyVal) {
            qtyVal.disabled = !inCart;
            qtyVal.max = String(stock);
            if (inCart) qtyVal.value = String(this.#cart.get(id));
          }
          for (const step of qtyWrap.querySelectorAll(".qty-step")) step.disabled = !inCart;
        }
      }

      const footer = root.querySelector(".shop-cart-footer");
      if (footer) {
        footer.classList.toggle("active", hasCart);
        const totalEl = footer.querySelector(".cart-total");
        if (totalEl) totalEl.textContent = this.#formatCp(cartCp);
        const countEl = footer.querySelector(".cart-count");
        if (countEl) countEl.textContent = String(cartUnits);
        const checkout = footer.querySelector(".cart-checkout");
        if (checkout) checkout.disabled = !(hasCart && buyer && cartCp <= wealthCp);
        const clear = footer.querySelector(".cart-clear");
        if (clear) clear.disabled = !hasCart;
      }
    }

    /* ----------------------- GM pricing settings ----------------------- */

    /** Favor panel context (GM): current values, slider bounds, and formatted display strings. */
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
        collapsed: this.#favorCollapsed
      };
    }

    /** GM context for the "Settings by" toggle + the per-bucket factor list (only buckets present in stock). */
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
            colorClass: this.#settingsBy === "rarity" ? `pus-rarity pus-rarity-${g.key}` : "",
            expanded: this.#expandedFactorRows.has(`${this.#settingsBy}:${g.key}`)
          };
        })
      };
    }

    /**
     * Clamp out-of-bounds favor / favorFactor / globalPriceFactor flags to the current world-setting
     * limits in one batched update. GM only; no-op (no re-render) when everything is already in range.
     */
    async #clampFavorFlags() {
      if (!game.user.isGM) return;
      const rawFavor = Number(this.actor.getFlag("pick-up-stix", "favor"));
      const rawFactor = Number(this.actor.getFlag("pick-up-stix", "favorFactor"));
      const rawGlobal = Number(this.actor.getFlag("pick-up-stix", "globalPriceFactor"));
      const max = getMaxPriceFactor();
      const clampedFavor = Number.isFinite(rawFavor)
        ? Math.max(getFavorMin(), Math.min(getFavorMax(), Math.round(rawFavor))) : null;
      const clampedFactor = Number.isFinite(rawFactor)
        ? Math.max(getFavorFactorMin(), Math.min(getFavorFactorMax(), Math.round(rawFactor))) : null;
      const clampedGlobal = Number.isFinite(rawGlobal)
        ? Math.max(0, Math.min(max, Math.round(rawGlobal))) : null;
      const updates = {};
      if (clampedFavor !== null && clampedFavor !== rawFavor) updates["flags.pick-up-stix.favor"] = clampedFavor;
      if (clampedFactor !== null && clampedFactor !== rawFactor) updates["flags.pick-up-stix.favorFactor"] = clampedFactor;
      if (clampedGlobal !== null && clampedGlobal !== rawGlobal) updates["flags.pick-up-stix.globalPriceFactor"] = clampedGlobal;
      if (!foundry.utils.isEmpty(updates)) {
        dbg("pf2e-vendor-sheet:clampFavorFlags", { vendor: this.actor.id, updates });
        await this.actor.update(updates);
      }
    }

    /** Wire the favor / favorFactor sliders (GM). `input` updates the live label; `change` clamps + writes the flag. */
    #wireFavorControls() {
      if (!game.user.isGM) return;
      const root = this.element?.[0] ?? this.element;
      const panel = root?.querySelector(".pus-favor-panel");
      if (!panel || panel.dataset.pusWired === "1") return;
      panel.dataset.pusWired = "1";
      const sign = (v) => `${v > 0 ? "+" : ""}${v}`;
      for (const range of panel.querySelectorAll(".pus-favor-range")) {
        const valueEl = range.closest(".pus-favor-slider").querySelector(".pus-favor-value");
        const isFavor = range.dataset.flag === "favor";
        const fmt = isFavor ? (v) => sign(v) : (v) => `${v}%`;
        range.addEventListener("input", () => { valueEl.textContent = fmt(Number(range.value)); });
        range.addEventListener("change", async () => {
          const raw = Math.round(Number(range.value) || 0);
          const v = isFavor
            ? Math.max(getFavorMin(), Math.min(getFavorMax(), raw))
            : Math.max(getFavorFactorMin(), Math.min(getFavorFactorMax(), raw || getFavorFactorDefault()));
          dbg("pf2e-vendor-sheet:favorControlChange", { vendor: this.actor.id, flag: range.dataset.flag, value: v });
          await this.actor.setFlag("pick-up-stix", range.dataset.flag, v);
        });
      }
    }

    /** Wire the global price factor + per-bucket factor sliders/number inputs in the settings panel (GM). */
    #wireSettingsControls() {
      if (!game.user.isGM) return;
      const root = this.element?.[0] ?? this.element;
      const list = root?.querySelector(".pus-factor-list");
      if (!list || list.dataset.pusWired === "1") return;
      list.dataset.pusWired = "1";
      const max = getMaxPriceFactor();
      const clamp = (v) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

      const globalRoot = list.closest(".pus-favor-content-inner");
      const globalRange = globalRoot?.querySelector(".pus-global-factor-range");
      const globalNum = globalRoot?.querySelector(".pus-global-factor-num");
      if (globalRange) {
        globalRange.addEventListener("input", () => { if (globalNum) globalNum.value = String(clamp(globalRange.value)); });
        if (globalNum) globalNum.addEventListener("input", () => { globalRange.value = String(clamp(globalNum.value)); });
        const commitGlobal = async (el) => {
          const v = clamp(el.value);
          dbg("pf2e-vendor-sheet:globalFactorChange", { vendor: this.actor.id, value: v });
          await this.actor.setFlag("pick-up-stix", "globalPriceFactor", v);
        };
        globalRange.addEventListener("change", () => commitGlobal(globalRange));
        if (globalNum) globalNum.addEventListener("change", () => commitGlobal(globalNum));
      }

      for (const row of list.querySelectorAll(".pus-factor-row")) {
        const range = row.querySelector(".pus-factor-range");
        const num = row.querySelector(".pus-factor-num");
        const mult = row.querySelector(".pus-factor-mult");
        if (!range || !num) continue;
        const flagKey = `groupingFactors.${row.dataset.dimension}.${row.dataset.key}`;
        const syncLive = (v) => {
          num.value = String(v);
          if (mult) mult.textContent = `×${(v / 100).toFixed(2)}`;
        };
        range.addEventListener("input", () => syncLive(clamp(range.value)));
        num.addEventListener("input", () => {
          range.value = String(clamp(num.value));
          if (mult) mult.textContent = `×${(clamp(num.value) / 100).toFixed(2)}`;
        });
        const commit = async (el) => {
          const v = clamp(el.value);
          dbg("pf2e-vendor-sheet:factorChange", { vendor: this.actor.id, flagKey, value: v });
          await this.actor.setFlag("pick-up-stix", flagKey, v);
        };
        range.addEventListener("change", () => commit(range));
        num.addEventListener("change", () => commit(num));
      }
    }

    /**
     * Size the settings backdrop to span from the bottom of the (variable-height) settings panel down
     * to the bottom of the shop content, so the open panel shades + blocks the list beneath it.
     */
    #sizeSettingsBackdrop() {
      const root = this.element?.[0] ?? this.element;
      const content = root?.querySelector(".pus-favor-content");
      const backdrop = content?.querySelector(":scope > .pus-settings-backdrop");
      if (!content || !backdrop) return;
      const tab = content.closest(".tab");
      if (!tab) return;
      const tabRect = tab.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const contentBottomInScroll = (contentRect.bottom - tabRect.top) + tab.scrollTop;
      const h = Math.max(0, tab.scrollHeight - contentBottomInScroll);
      backdrop.style.height = `${h}px`;
    }

    /** (Re)observe the settings content + shop tab so the backdrop height tracks expansion/resize. GM only. */
    #wireSettingsBackdrop() {
      if (!game.user.isGM) return;
      const root = this.element?.[0] ?? this.element;
      const content = root?.querySelector(".pus-favor-content");
      const tab = content?.closest(".tab");
      if (!content || !tab) return;
      if (!this.#backdropObserver) this.#backdropObserver = new ResizeObserver(() => this.#sizeSettingsBackdrop());
      this.#backdropObserver.disconnect();
      this.#backdropObserver.observe(content);
      this.#backdropObserver.observe(tab);
      dbg("pf2e-vendor-sheet:wireSettingsBackdrop", "observing settings + tab for backdrop sizing");
      this.#sizeSettingsBackdrop();
    }

    /** Collapse/expand the settings panel — DOM-only so the CSS transition runs; field records the state. */
    #onToggleFavorPanel(event) {
      const bar = event.currentTarget;
      const panel = bar.closest(".pus-favor-panel");
      if (!panel) return;
      const collapsed = panel.classList.toggle("collapsed");
      bar.setAttribute("aria-expanded", String(!collapsed));
      dbg("pf2e-vendor-sheet:onToggleFavorPanel", { vendor: this.actor.id, collapsed });
      this.#favorCollapsed = collapsed;
    }

    /** Switch the factor list between the Type and Rarity dimensions (GM). Re-renders the shop. */
    #onSettingsBy(event) {
      const dim = event.currentTarget.dataset.dimension;
      if (dim !== "type" && dim !== "rarity") return;
      if (this.#settingsBy === dim) return;
      dbg("pf2e-vendor-sheet:onSettingsBy", { vendor: this.actor.id, dim });
      this.#settingsBy = dim;
      this.render(false);
    }

    /** Expand/collapse one grouping-factor row. DOM-only; the Set records state for the next re-render. */
    #onToggleFactorRow(event) {
      if (event.target.closest(".pus-factor-body")) return;   // ignore clicks on the slider/number
      const head = event.currentTarget;
      const row = head.closest(".pus-factor-row");
      if (!row) return;
      const id = `${row.dataset.dimension}:${row.dataset.key}`;
      const expanded = row.classList.toggle("expanded");
      head.setAttribute("aria-expanded", String(expanded));
      if (expanded) this.#expandedFactorRows.add(id);
      else this.#expandedFactorRows.delete(id);
      dbg("pf2e-vendor-sheet:onToggleFactorRow", { vendor: this.actor.id, id, expanded });
    }

    /* --------------------- Shop visibility / restock ------------------- */

    /**
     * Inject a shop-visibility toggle (fa-store) into each native inventory row's
     * controls (GM). Active = the ware is in the shop; dimmed = hidden. Clicking it
     * flips the item's `shopVisible` flag → re-render → the Shop tab + player
     * storefront re-filter. Idempotent (the DOM is rebuilt each render, so we
     * re-inject). Scoped to top-level section rows — not container-contents/subitems.
     */
    #injectInventoryShopToggles() {
      if (!game.user.isGM) return;
      const root = this.element?.[0] ?? this.element;
      const invTab = root?.querySelector(".tab.inventory");
      if (!invTab) return;
      const adapter = getAdapter();
      let injected = 0;
      for (const li of invTab.querySelectorAll("ul.items:not(.container-contents):not(.subitems) > li[data-item-id]")) {
        const item = this.actor.items.get(li.dataset.itemId);
        if (!item || !adapter.isPhysicalItem(item)) continue;
        const controls = li.querySelector(":scope > .data > .item-controls:not(.readonly)");
        if (!controls || controls.querySelector(":scope > .pus-inv-shop-toggle")) continue;   // idempotent
        const visible = item.getFlag("pick-up-stix", "shopVisible") !== false;
        controls.prepend(createRowControl({
          iconClass: "fa-solid fa-store fa-fw",
          titleKey: "INTERACTIVE_ITEMS.Vendor.ToggleShopVisible",
          extraClass: "pus-inv-shop-toggle",
          active: visible,
          onClick: async () => {
            dbg("pf2e-vendor-sheet:invShopToggle", { item: item.id, name: item.name, from: visible, to: !visible });
            await item.setFlag("pick-up-stix", "shopVisible", !visible);
          }
        }));
        injected++;
      }
      dbg("pf2e-vendor-sheet:injectInventoryShopToggles", { injected });
    }

    /** Master toggle: add every physical item to the shop, or remove them all if already all in (GM). */
    async #onToggleAllShop() {
      const adapter = getAdapter();
      const physical = this.actor.items.filter(i => adapter.isPhysicalItem(i));
      const allVisible = physical.length > 0
        && physical.every(i => i.getFlag("pick-up-stix", "shopVisible") !== false);
      const next = !allVisible;
      dbg("pf2e-vendor-sheet:onToggleAllShop", { from: allVisible, to: next, count: physical.length });
      const updates = physical.map(i => ({ _id: i.id, "flags.pick-up-stix.shopVisible": next }));
      if (updates.length) await this.actor.updateEmbeddedDocuments("Item", updates);
    }

    /** Snapshot the current physical inventory as this vendor's default (GM). */
    async #onSetInventory() {
      dbg("pf2e-vendor-sheet:onSetInventory", { vendor: this.actor.id });
      const count = await saveDefaultInventory(this.actor);
      ui.notifications.info(game.i18n.format("INTERACTIVE_ITEMS.Vendor.SetInventoryDone", { count }));
    }

    /** Restock to the saved default: always add missing items/qty; confirm before removing extras (GM). */
    async #onRestock() {
      const diff = computeRestockDiff(this.actor);
      if (!diff) {
        dbg("pf2e-vendor-sheet:onRestock", "no default saved, bail", { vendor: this.actor.id });
        ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Vendor.RestockNoDefault"));
        return;
      }
      const hasExtras = diff.extraQty.length > 0 || diff.extraItems.length > 0;
      const hasAdds = diff.toCreate.length > 0 || diff.toIncrease.length > 0;
      if (!hasExtras && !hasAdds) {
        dbg("pf2e-vendor-sheet:onRestock", "already matches default", { vendor: this.actor.id });
        ui.notifications.info(game.i18n.localize("INTERACTIVE_ITEMS.Vendor.RestockNothing"));
        return;
      }
      const removeExtras = hasExtras ? await promptRestockRemoval(diff) : false;
      dbg("pf2e-vendor-sheet:onRestock", "applying", { vendor: this.actor.id, removeExtras, hasAdds, hasExtras });
      const summary = await applyRestock(this.actor, diff, { removeExtras });
      ui.notifications.info(game.i18n.format("INTERACTIVE_ITEMS.Vendor.RestockDone", summary));
    }

    /* ---------------------------- Ware filters ------------------------- */

    /**
     * Filter-bar context (all viewers). Rarity options are the rarities actually present in the
     * in-shop wares, ordered by the pf2e rarity ladder. A stored rarity no longer present resets
     * to "All" so the select can't show a dead value.
     */
    #prepareFilters() {
      const adapter = getAdapter();
      const eligible = this.actor.items.filter(i =>
        adapter.isPhysicalItem(i) && !i.isCurrency
        && i.getFlag("pick-up-stix", "shopVisible") !== false);
      const options = buildSettingsGroups(eligible, "rarity");   // [{key,label,count}] ladder-ordered
      if (this.#filterRarity && !options.some(o => o.key === this.#filterRarity)) {
        dbg("pf2e-vendor-sheet:prepareFilters", "stored rarity no longer present, resetting", { rarity: this.#filterRarity });
        this.#filterRarity = "";
      }
      return {
        rarity: this.#filterRarity,
        affordable: this.#filterAffordable,
        rarityOptions: options.map(o => ({ key: o.key, label: o.label, selected: o.key === this.#filterRarity }))
      };
    }

    /**
     * Client-side affordable filter: hide wares the resolved buyer can't afford (≥1 unit), hide a
     * group header when its whole list is hidden, and show the empty-state when nothing is left.
     * With no buyer the filter is a no-op (show all). Safe to call when off — it resets all hiding.
     */
    #applyAffordableFilter() {
      const root = this.element?.[0] ?? this.element;
      if (!root) return;
      const adapter = getAdapter();
      const buyer = this.#resolveBuyer();
      const on = this.#filterAffordable;
      let anyVisible = false;

      for (const li of root.querySelectorAll(".tab.shop .pus-shop-list li[data-item-id]")) {
        const id = li.dataset.itemId;
        const item = this.actor.items.get(id);
        if (!item) continue;
        // In-cart wares stay visible so the shopper can still see/adjust them.
        const show = !on || !buyer || this.#cart.has(id) || adapter.canAfford(buyer, item, 1);
        li.style.display = show ? "" : "none";
        if (show) anyVisible = true;
      }
      // Hide a section header when its list has no visible rows.
      for (const ul of root.querySelectorAll(".tab.shop .pus-shop-list ul.items")) {
        const visible = [...ul.querySelectorAll("li[data-item-id]")].some(r => r.style.display !== "none");
        const header = ul.previousElementSibling;
        if (header?.matches?.("header[data-group-key]")) header.style.display = visible ? "" : "none";
      }
      const empty = root.querySelector(".tab.shop .shop-filter-empty");
      if (empty) empty.style.display = (on && !anyVisible) ? "" : "none";
      dbg("pf2e-vendor-sheet:applyAffordableFilter", { on, anyVisible });
    }

    /** Rarity select changed — re-render so the shop rebuilds with the server-side rarity filter. */
    #onFilterRarityChange(event) {
      event.stopPropagation();   // don't let pf2e's form submit-on-change also fire
      this.#filterRarity = event.currentTarget.value || "";
      dbg("pf2e-vendor-sheet:onFilterRarityChange", { rarity: this.#filterRarity });
      this.render(false);
    }

    /** Affordable toggle button clicked — flip the flag + DOM-only re-filter (no re-render, no flicker). */
    #onFilterAffordableChange(event) {
      event.preventDefault();
      event.stopPropagation();
      this.#filterAffordable = !this.#filterAffordable;
      const btn = event.currentTarget;
      btn.classList.toggle("active", this.#filterAffordable);
      btn.setAttribute("aria-pressed", String(this.#filterAffordable));
      dbg("pf2e-vendor-sheet:onFilterAffordableChange", { affordable: this.#filterAffordable });
      this.#applyAffordableFilter();
    }

    /** Reset both filters to their default unfiltered state. */
    #onResetFilters() {
      if (!this.#filterRarity && !this.#filterAffordable) return;
      dbg("pf2e-vendor-sheet:onResetFilters", { vendor: this.actor.id });
      this.#filterRarity = "";
      this.#filterAffordable = false;
      this.render(false);
    }

    /* ------------------------------ Queue ------------------------------ */

    /**
     * Whether THIS viewer may currently transact: the GM always; a player only when
     * their actor is at the front of the vendor's queue. Gates the ENABLED state of
     * the (always-rendered) buy/cart controls — a waiting shopper sees them disabled.
     */
    #isActiveShopper() {
      if (game.user.isGM) return true;
      const myActor = getPlayerCandidateTokens()[0]?.actor ?? game.user.character;
      if (!myActor) return false;
      return getVendorQueue(this.actor)[0] === myActor.id;
    }

    /** Map the queue actorIds to display rows for the strip (active = index 0). */
    #prepareQueue() {
      return getVendorQueue(this.actor).reduce((rows, actorId, i) => {
        const user = game.users.find(u => u.character?.id === actorId);
        const character = user?.character ?? game.actors.get(actorId) ?? null;
        if (!character) return rows;             // actor deleted or no matching user — skip
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

    /** Per-user, per-vendor queue-panel collapse state (defaults to expanded). */
    #isQueueCollapsed() {
      const map = game.user.getFlag("pick-up-stix", "queueCollapsed") ?? {};
      return map[this.actor.id] ?? false;
    }

    /** Persist the queue-panel collapse state for this user + vendor (user flag → no actor re-render). */
    async #setQueueCollapsed(collapsed) {
      const map = { ...(game.user.getFlag("pick-up-stix", "queueCollapsed") ?? {}) };
      map[this.actor.id] = collapsed;
      dbg("pf2e-vendor-sheet:setQueueCollapsed", { vendor: this.actor.id, collapsed });
      await game.user.setFlag("pick-up-stix", "queueCollapsed", map);
    }

    /** GM queue-panel collapse toggle — DOM-only so the CSS height transition runs on the live DOM. */
    #onToggleQueuePanel(event) {
      const bar = event.currentTarget;
      const panel = bar.closest(".pus-queue-panel");
      if (!panel) return;
      const collapsed = panel.classList.toggle("collapsed");
      bar.setAttribute("aria-expanded", String(!collapsed));
      dbg("pf2e-vendor-sheet:onToggleQueuePanel", { vendor: this.actor.id, collapsed });
      this.#setQueueCollapsed(collapsed);
    }

    /**
     * Enqueue this user on open/maximize. If they're already in another vendor's queue, confirm the
     * switch first (single button; the X dismisses → stay put). The GM is never queued. Called
     * fire-and-forget so the dialog never blocks the render.
     */
    async #requestJoin() {
      if (game.user.isGM) return;
      const myActor = getPlayerCandidateTokens()[0]?.actor ?? game.user.character;
      if (!myActor) { dbg("pf2e-vendor-sheet:requestJoin", "no candidate actor, skipping join"); return; }
      const others = findUserVendorQueues(myActor.id).filter(a => a.id !== this.actor.id);
      if (!others.length) { this.#joinQueue(myActor); return; }   // not queued elsewhere → join now
      dbg("pf2e-vendor-sheet:requestJoin", "queued elsewhere, confirming switch", { others: others.map(a => a.id) });
      const confirmed = await promptVendorQueueSwitch(this.actor.name, others[0].name);
      if (confirmed) this.#joinQueue(myActor);                     // GM-side join displaces the prior queue(s)
      else dbg("pf2e-vendor-sheet:requestJoin", "switch declined — staying in prior queue, not joining this one");
    }

    /** Emit a join request to the active GM (GM is never queued). */
    #joinQueue(myActor) {
      if (game.user.isGM) return;
      dbg("pf2e-vendor-sheet:joinQueue", { vendor: this.actor.id, actor: myActor.id });
      emitSocketEvent("vendorQueueJoin", { vendorActorId: this.actor.id, actorId: myActor.id });
    }

    /** A player minimized/closed this vendor sheet — dequeue them and drop their cart. */
    #leaveQueue() {
      if (game.user.isGM) return;
      const myActor = getPlayerCandidateTokens()[0]?.actor ?? game.user.character;
      if (!myActor) return;
      this.#cart.clear();                 // leaving clears my basket so nothing carries over
      dbg("pf2e-vendor-sheet:leaveQueue", { vendor: this.actor.id, actor: myActor.id });
      emitSocketEvent("vendorQueueLeave", { vendorActorId: this.actor.id, actorId: myActor.id });
    }

    /* --------------------------- Lifecycle ---------------------------- */

    /**
     * Leave the queue when the window is minimized (only on a real transition).
     * V1 Application tracks minimized state on the `_minimized` field (false/true/null
     * mid-animation) — there is NO `minimized` getter as on ApplicationV2, so read the
     * field directly.
     */
    async minimize() {
      const wasMinimized = this._minimized === true;
      await super.minimize();
      if (!wasMinimized && this._minimized === true) this.#leaveQueue();
    }

    /** Rejoin (gated) when the window is restored from minimized (V1 `_minimized` field). */
    async maximize() {
      const wasMinimized = this._minimized === true;
      await super.maximize();
      if (wasMinimized && this._minimized === false) this.#requestJoin();
    }

    /** Leave the queue + reset transient panel state + tear down observers/hooks on close. */
    async close(options = {}) {
      this.#leaveQueue();
      this.#hasJoinedQueue = false;   // reopen re-joins
      if (this.#backdropObserver) { this.#backdropObserver.disconnect(); this.#backdropObserver = null; }
      if (this.#controlHookId !== null) { Hooks.off("controlToken", this.#controlHookId); this.#controlHookId = null; }
      this.#favorCollapsed = true;    // the settings panel always reopens collapsed
      this.#filterRarity = "";        // ware filters are view-only — reopen unfiltered
      this.#filterAffordable = false;
      return super.close(options);
    }
  };
}
