import { dbg } from "../../utils/debugLog.mjs";
import { vendorItemMultiplier, basePriceCp } from "./shopGrouping.mjs";

/**
 * Exact charge in copper: per-unit price × qty × multiplier, sub-unit rounded UP
 * (vendor's favour). The inner round to 1e-4 kills float noise so a whole-cp value
 * doesn't get ceil'd up by a 1e-13 artifact.
 *
 * @param {Item} item
 * @param {number} quantity
 * @param {number} multiplier
 * @returns {number}
 */
function chargeCp(item, quantity, multiplier = 1) {
  const raw = basePriceCp(item) * quantity * multiplier;
  const cp = Math.ceil(Math.round(raw * 1e4) / 1e4);
  return cp > 0 ? cp : 0;
}

/**
 * pf2e vendor purchase / currency concern. Mixed onto Pf2eAdapter.prototype.
 *
 * pf2e money is treasure-Item documents (not a number): wealth is
 * `actor.inventory.coins` (a Coins; `.copperValue` is the number), and
 * `inventory.removeCoins`/`addCoins` are async and only ever move REAL coins
 * (never conjured). removeCoins returns `false` on insufficient funds and makes
 * change automatically from the buyer's own purse — so there is a single
 * settlement mode (dnd5e's magic-vs-real split collapses here). Both
 * removeCoins/addCoins accept a plain `{pp,gp,sp,cp}` object, so the shared
 * CurrencyConverter.decompose output passes straight through.
 */
export const Pf2ePurchase = {

  /**
   * Normalised price. pf2e's native price is a Coins object with no single
   * value+denomination, so we express it as copper (cp). Not consumed by the
   * shared flow today, but kept contract-correct.
   */
  getItemPrice(item) {
    const cp = this.currency ? this.currency.bundleToBase(item?.system?.price?.value ?? {}) : 0;
    return { value: cp, denomination: this.currency?.baseDenom ?? "cp" };
  },

  getItemChargeCp(item, quantity = 1) {
    return chargeCp(item, quantity, vendorItemMultiplier(item));
  },

  getActorWealthCp(actor) {
    // actor.inventory.coins is a Coins; .copperValue is the number. Infinity when
    // the actor has no inventory (so affordability never spuriously blocks).
    return actor?.inventory?.coins?.copperValue ?? Infinity;
  },

  canAfford(buyer, item, quantity = 1) {
    const cp = this.getItemChargeCp(item, quantity);
    if (cp <= 0) return true;
    return this.getActorWealthCp(buyer) >= cp;
  },

  /**
   * Compute (no mutation) the coin bundle for a `cp` charge. Returns null when
   * the buyer can't afford it. The plan is opaque; we store the decomposed coins.
   */
  planSettlement(buyer, vendor, cp) {
    if (cp <= 0) return { mode: "noop" };
    if (buyer && this.getActorWealthCp(buyer) < cp) {
      dbg("pf2e-purchase:planSettlement", "buyer cannot afford", { cp });
      return null;
    }
    const { coins } = this.currency.decompose(cp);   // tidy {pp,gp,sp,cp}
    dbg("pf2e-purchase:planSettlement", "ok", { cp, coins });
    return { mode: "coins", cp, coins };
  },

  /** Debit the buyer (GM-side). removeCoins makes change from real coins; returns false if short. */
  async applyBuyerSettlement(buyer, plan) {
    if (!plan || plan.mode === "noop") return;
    dbg("pf2e-purchase:applyBuyerSettlement", "debit", { buyer: buyer?.id, cp: plan.cp });
    const ok = await buyer.inventory.removeCoins(plan.coins, { byValue: true });
    if (ok === false) {
      // planSettlement pre-checked affordability; reaching here implies a race
      // (the buyer spent between plan and apply). Surface rather than silently
      // crediting the vendor for coins that never left the buyer.
      dbg("pf2e-purchase:applyBuyerSettlement", "removeCoins returned false (race)", { buyer: buyer?.id });
      throw new Error("pick-up-stix | pf2e: buyer had insufficient funds at settlement time");
    }
  },

  /** Credit the vendor (GM-side) — tidy denominations via addCoins. */
  async applyVendorSettlement(vendor, plan) {
    if (!plan || plan.mode === "noop") return;
    dbg("pf2e-purchase:applyVendorSettlement", "credit", { vendor: vendor?.id, coins: plan.coins });
    await vendor.inventory.addCoins(plan.coins);
  },

  /**
   * pf2e physical items stack by quantity; bulk purchase keeps one stack.
   * (The base contract default is already `true`; declared here for locality.)
   *
   * @param {Item} _item
   * @returns {boolean}
   */
  stacksOnPurchase(_item) {
    return true;
  }
};
