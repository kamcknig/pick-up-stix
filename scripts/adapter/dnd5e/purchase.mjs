import { dbg } from "../../utils/debugLog.mjs";

/**
 * Given an exact copper-piece total, return the coarsest whole-coin denomination that
 * represents it precisely. Picking the coarsest denomination makes change come back
 * tidy — e.g. 1020 cp → "102 sp" so a gp-only buyer gets 8 sp change (not 80 cp).
 *
 * @param {number} cp - Exact value in copper pieces (must be a non-negative integer).
 * @returns {{ amount: number, denomination: string }}
 */
function denomFromCp(cp) {
  if (cp % 100 === 0) return { amount: cp / 100, denomination: "gp" };  // whole gp
  if (cp % 10 === 0) return { amount: cp / 10, denomination: "sp" };    // whole sp → silver change
  return { amount: cp, denomination: "cp" };                            // sub-sp → copper
}

/**
 * The EXACT charge for a purchase, expressed as a whole-coin amount in the COARSEST
 * denomination that represents it precisely (gp if whole, else sp, else cp). Charging in
 * a whole coin lets dnd5e's change-making pay a sub-unit remainder from a coarser purse,
 * and picking the coarsest denomination makes the change come back tidy — e.g. 10.2 gp →
 * 102 sp, so a gp-only buyer gets 8 sp change (not 80 cp). Also returns the value in copper
 * for crediting the vendor a consolidated coin payload. The buyer pays the exact value,
 * except any sub-copper fraction is rounded UP (always in the vendor's favour); the Price
 * column separately rounds up to whole gp for display.
 *
 * @param {{ value:number, denomination:string }} price
 * @param {number} quantity
 * @returns {{ amount:number, denomination:string, cp:number }}
 */
function chargeAmount(price, quantity) {
  const conv = CONFIG.DND5E.currencies?.[price.denomination]?.conversion;
  if (!price.value || !conv) return { amount: 0, denomination: "gp", cp: 0 };
  // Exact value in copper, rounding any sub-copper fraction UP (always favours the vendor).
  // Inner round to 1e-4 first kills float noise so a whole-cp value (e.g. 10.2 gp = 1020 cp)
  // doesn't get ceil'd up by a 1e-13 artifact.
  const rawCp = (price.value * quantity / conv) * 100;
  const cp = Math.ceil(Math.round(rawCp * 1e4) / 1e4);
  if (cp <= 0) return { amount: 0, denomination: "gp", cp: 0 };
  const { amount, denomination } = denomFromCp(cp);
  return { amount, denomination, cp };
}

/** Decompose a copper amount into a tidy { gp, sp, cp } payload for crediting the vendor. */
function coinsFromCp(cp) {
  const out = {};
  const gp = Math.floor(cp / 100);
  const sp = Math.floor((cp % 100) / 10);
  const c = cp % 10;
  if (gp) out.gp = gp;
  if (sp) out.sp = sp;
  if (c) out.cp = c;
  return out;
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
      denomination: price.denomination || CONFIG.DND5E.defaultCurrency || "gp"
    };
  },

  canAfford(buyer, item, quantity = 1) {
    const { amount, denomination } = chargeAmount(this.getItemPrice(item), quantity);
    if (amount <= 0) return true;                     // free
    if (!buyer) return false;
    const { CurrencyManager } = game.dnd5e.applications;
    const { remainder } = CurrencyManager.getActorCurrencyUpdates(
      buyer, amount, denomination, { priority: "high" }   // coarsest whole coin → tidy change
    );
    return !remainder;
  },

  getItemChargeCp(item, quantity = 1) {
    return chargeAmount(this.getItemPrice(item), quantity).cp;
  },

  getActorWealthCp(actor) {
    const currency = actor?.system?.currency ?? {};
    let cp = 0;
    for ( const [denom, { conversion }] of Object.entries(CONFIG.DND5E.currencies) ) {
      cp += (currency[denom] ?? 0) * (100 / conversion);   // cp-per-coin = 100 / coins-per-gp
    }
    return cp;
  },

  async debitBuyerCp(buyer, cp) {
    if ( cp <= 0 ) return true;
    const { amount, denomination } = denomFromCp(cp);
    const { CurrencyManager } = game.dnd5e.applications;
    // Non-mutating change-making (mirrors CurrencyManager.deductActorCurrency, which applies
    // `updates` = { system: { currency } }); we apply it ourselves with render suppressed and a
    // marker the vendor sheet's currency hook skips, so the deduction doesn't flicker the shop.
    // eslint-disable-next-line no-unused-vars
    const { item, remainder, ...updates } = CurrencyManager.getActorCurrencyUpdates(buyer, amount, denomination, { priority: "high" });
    if ( remainder ) {
      dbg("dnd5e-purchase:debitBuyerCp", "buyer cannot afford", { buyer: buyer?.id, amount, denomination, cp });
      return false;
    }
    dbg("dnd5e-purchase:debitBuyerCp", "debit buyer (no render)", { buyer: buyer?.id, amount, denomination, cp });
    await buyer.update(updates, { render: false, pickUpStix: { suppressVendorRender: true } });
    return true;
  },

  async creditVendorCp(vendor, cp) {
    const currency = foundry.utils.deepClone(vendor.system?.currency ?? {});
    for ( const [denom, n] of Object.entries(coinsFromCp(cp)) ) currency[denom] = (currency[denom] ?? 0) + n;
    // The last write of the checkout — render normally (diff:false so a zero-coin cart still
    // forces the one re-render) so every client updates exactly once with the final state.
    dbg("dnd5e-purchase:creditVendorCp", "credit vendor (renders once)", { vendor: vendor?.id, cp });
    await vendor.update({ "system.currency": currency }, { diff: false });
  }
};
