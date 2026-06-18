import { dbg } from "../../utils/debugLog.mjs";

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
  if (cp % 100 === 0) return { amount: cp / 100, denomination: "gp", cp };   // whole gp
  if (cp % 10 === 0) return { amount: cp / 10, denomination: "sp", cp };     // whole sp → silver change
  return { amount: cp, denomination: "cp", cp };                            // sub-sp → copper
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

  async applyPurchaseCurrency(buyer, vendor, item, quantity = 1) {
    const { amount, denomination, cp } = chargeAmount(this.getItemPrice(item), quantity);
    if (amount <= 0) return true;                     // free item, nothing to move
    const { CurrencyManager, Award } = game.dnd5e.applications;

    const { remainder } = CurrencyManager.getActorCurrencyUpdates(
      buyer, amount, denomination, { priority: "high" }
    );
    if (remainder) {
      dbg("dnd5e-purchase:applyPurchaseCurrency", "buyer cannot afford", { buyer: buyer?.id, amount, denomination, remainder });
      return false;
    }

    dbg("dnd5e-purchase:applyPurchaseCurrency", "debit buyer / credit vendor (exact)", {
      buyer: buyer?.id, vendor: vendor?.id, amount, denomination, cp
    });
    try {
      await CurrencyManager.deductActorCurrency(buyer, amount, denomination, { priority: "high" });
    } catch (err) {                                   // throws InsufficientFunds on a race
      dbg("dnd5e-purchase:applyPurchaseCurrency", "deduct threw, aborting", { err: err?.message });
      return false;
    }
    await Award.awardCurrency(coinsFromCp(cp), [vendor]);   // credit the exact value as tidy coins
    return true;
  }
};
