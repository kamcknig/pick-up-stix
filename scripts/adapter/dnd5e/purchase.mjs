import { dbg } from "../../utils/debugLog.mjs";
import { vendorItemMultiplier } from "./shopGrouping.mjs";

/**
 * Exact charge in base units (cp): price × qty × multiplier, sub-unit rounded UP (vendor's favour).
 * Inner round to 1e-4 kills float noise so a whole-cp value (e.g. 10.2 gp = 1020 cp)
 * doesn't get ceil'd up by a 1e-13 artifact.
 */
function chargeCp(converter, price, quantity, multiplier = 1) {
  if ( !converter || !price.value ) return 0;
  const raw = converter.toBase(price.value * quantity, price.denomination) * multiplier;
  const cp = Math.ceil(Math.round(raw * 1e4) / 1e4);
  return cp > 0 ? cp : 0;
}

const useOnlyAvailable = () => { try { return !!game.settings.get("pick-up-stix", "useOnlyAvailableCurrency"); } catch { return false; } };

/** Clone actor currency and apply a signed {denom:count} delta. */
function withDelta(actor, delta) {
  const c = foundry.utils.deepClone(actor.system?.currency ?? {});
  for ( const [d, n] of Object.entries(delta) ) c[d] = (c[d] ?? 0) + n;
  return c;
}

/**
 * dnd5e vendor purchase / currency concern. Mixed onto Dnd5eAdapter.prototype.
 * Requires dnd5e >= 4.1.0 (CurrencyManager.deductActorCurrency / getActorCurrencyUpdates).
 */
export const Dnd5ePurchase = {

  getItemPrice(item) {
    const price = item?.system?.price ?? {};
    return {
      value: Number(price.value) || 0,
      denomination: price.denomination || this.currency?.defaultDenom || "gp"
    };
  },

  canAfford(buyer, item, quantity = 1) {
    const cp = chargeCp(this.currency, this.getItemPrice(item), quantity, vendorItemMultiplier(item));
    if ( cp <= 0 ) return true;
    return this.getActorWealthCp(buyer) >= cp;
  },

  getItemChargeCp(item, quantity = 1) {
    return chargeCp(this.currency, this.getItemPrice(item), quantity, vendorItemMultiplier(item));
  },

  getActorWealthCp(actor) {
    return this.currency ? this.currency.bundleToBase(actor?.system?.currency ?? {}) : Infinity;
  },

  /**
   * Compute (without mutating) how a `cp` transfer from buyer→vendor would settle.
   * Returns an opaque plan object, or null when the purchase can't be paid/changed.
   *   magic mode: buyer pays via CurrencyManager (change conjured as needed).
   *   real mode:  converter.settle over both real purses — no coins created.
   */
  planSettlement(buyer, vendor, cp) {
    if ( cp <= 0 ) return { mode: "noop" };
    if ( useOnlyAvailable() ) {
      const plan = this.currency.settle(cp, buyer?.system?.currency ?? {}, vendor?.system?.currency ?? {});
      dbg("dnd5e-purchase:planSettlement", "real mode", { cp, feasible: !!plan });
      return plan ? { mode: "real", ...plan } : null;
    }
    if ( !buyer ) return null;
    const { amount, denomination } = this.currency.coarsestCoin(cp);
    const { CurrencyManager } = game.dnd5e.applications;
    // eslint-disable-next-line no-unused-vars
    const { item, remainder, ...buyerUpdates } = CurrencyManager.getActorCurrencyUpdates(buyer, amount, denomination, { priority: "high" });
    if ( remainder ) { dbg("dnd5e-purchase:planSettlement", "magic mode: buyer cannot afford", { cp }); return null; }
    dbg("dnd5e-purchase:planSettlement", "magic mode", { cp, amount, denomination });
    return { mode: "magic", buyerUpdates, vendorCoins: this.currency.decompose(cp).coins };
  },

  /** Apply the buyer side of a plan (render-suppressed — fires before items move). */
  async applyBuyerSettlement(buyer, plan) {
    if ( !plan || plan.mode === "noop" ) return;
    const opts = { render: false, pickUpStix: { suppressVendorRender: true } };
    if ( plan.mode === "magic" ) {
      dbg("dnd5e-purchase:applyBuyerSettlement", "magic debit", { buyer: buyer?.id });
      await buyer.update(plan.buyerUpdates, opts);
      return;
    }
    dbg("dnd5e-purchase:applyBuyerSettlement", "real debit", { buyer: buyer?.id, delta: plan.buyerDelta });
    await buyer.update({ "system.currency": withDelta(buyer, plan.buyerDelta) }, opts);
  },

  /** Apply the vendor side of a plan (renders — the single final write of a transaction). */
  async applyVendorSettlement(vendor, plan) {
    if ( !plan || plan.mode === "noop" ) return;
    const currency = foundry.utils.deepClone(vendor.system?.currency ?? {});
    if ( plan.mode === "magic" ) {
      for ( const [d, n] of Object.entries(plan.vendorCoins) ) currency[d] = (currency[d] ?? 0) + n;
    } else {
      for ( const [d, n] of Object.entries(plan.vendorDelta) ) currency[d] = (currency[d] ?? 0) + n;
    }
    dbg("dnd5e-purchase:applyVendorSettlement", "credit vendor (renders once)", { vendor: vendor?.id, mode: plan.mode });
    await vendor.update({ "system.currency": currency }, { diff: false });
  },

  /**
   * Only consumables stack when purchased in bulk; every other dnd5e item type
   * (weapon, equipment, tool, container, loot) splits into separate qty-1
   * documents so the buyer receives distinct inventory entries.
   *
   * @param {Item} item
   * @returns {boolean}
   */
  stacksOnPurchase(item) {
    return item?.type === "consumable";
  }
};
