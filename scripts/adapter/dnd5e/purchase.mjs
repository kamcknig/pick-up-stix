import { dbg } from "../../utils/debugLog.mjs";

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
    const { value, denomination } = this.getItemPrice(item);
    const total = value * quantity;
    if (total <= 0) return true;                      // free
    if (!buyer) return false;
    const { CurrencyManager } = game.dnd5e.applications;
    const { remainder } = CurrencyManager.getActorCurrencyUpdates(
      buyer, total, denomination, { priority: "high" }   // pure, no mutation
    );
    return !remainder;
  },

  async applyPurchaseCurrency(buyer, vendor, item, quantity = 1) {
    const { value, denomination } = this.getItemPrice(item);
    const total = value * quantity;
    if (total <= 0) return true;                      // free item, nothing to move
    const { CurrencyManager, Award } = game.dnd5e.applications;

    const { remainder } = CurrencyManager.getActorCurrencyUpdates(
      buyer, total, denomination, { priority: "high" }
    );
    if (remainder) {
      dbg("dnd5e-purchase:applyPurchaseCurrency", "buyer cannot afford", {
        buyer: buyer?.id, total, denomination, remainder
      });
      return false;
    }

    dbg("dnd5e-purchase:applyPurchaseCurrency", "debit buyer / credit vendor", {
      buyer: buyer?.id, vendor: vendor?.id, total, denomination
    });
    try {
      await CurrencyManager.deductActorCurrency(buyer, total, denomination, { priority: "high" });
    } catch (err) {                                   // throws InsufficientFunds on a race
      dbg("dnd5e-purchase:applyPurchaseCurrency", "deduct threw, aborting", { err: err?.message });
      return false;
    }
    await Award.awardCurrency({ [denomination]: total }, [vendor]);  // fresh literal each call
    return true;
  }
};
