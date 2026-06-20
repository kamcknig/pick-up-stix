import { dbg } from "./debugLog.mjs";

/**
 * System-agnostic currency converter. Parameterised by a denomination table that
 * maps each denomination key to its value in the system's base (smallest) unit.
 * dnd5e: base is copper, table { pp:1000, gp:100, ep:50, sp:10, cp:1 }.
 *
 * The converter never reads a system CONFIG itself — each adapter builds the table
 * and hands it in, so the math here stays generic and unit-testable.
 */
export class CurrencyConverter {
  /**
   * @param {object} opts
   * @param {Record<string, number>} opts.denominations  denom -> value in base units (must include the base = 1)
   * @param {string} opts.baseDenom        smallest denomination key
   * @param {string} [opts.defaultDenom]   denomination assumed when a price omits one
   * @param {string[]} [opts.changeDenoms] denominations used when generating change (defaults to all)
   */
  constructor({ denominations, baseDenom, defaultDenom, changeDenoms } = {}) {
    this.denominations = denominations ?? {};
    this.baseDenom = baseDenom;
    this.defaultDenom = defaultDenom ?? baseDenom;
    // Coarse → fine (largest base value first), for greedy decomposition.
    this.ordered = Object.keys(this.denominations).sort((a, b) => this.denominations[b] - this.denominations[a]);
    this.changeDenoms = changeDenoms ?? this.ordered;
  }

  /** Base-unit value of one coin of `denom` (0 if unknown). */
  unit(denom) { return this.denominations[denom] ?? 0; }

  /** `amount` coins of `denom` → base units. */
  toBase(amount, denom) { return (Number(amount) || 0) * this.unit(denom); }

  /** `amount` of `from` → equivalent (possibly fractional) count of `to`. */
  convert(amount, from, to) {
    const u = this.unit(to);
    return u ? this.toBase(amount, from) / u : 0;
  }

  /** Sum a `{denom: count}` bundle into base units. */
  bundleToBase(coins = {}) {
    let total = 0;
    for ( const [denom, n] of Object.entries(coins) ) total += this.toBase(n, denom);
    return total;
  }

  /** Signed base-unit difference between two bundles (a − b). */
  difference(a = {}, b = {}) { return this.bundleToBase(a) - this.bundleToBase(b); }

  /**
   * Greedy largest-first decomposition of a base amount into whole coins over `denoms`.
   * Returns `{ coins, remainder }`; remainder is 0 when `denoms` includes the base denom.
   */
  decompose(baseAmount, denoms = this.changeDenoms) {
    let rest = Math.max(0, Math.round(baseAmount));
    const coins = {};
    for ( const denom of denoms.slice().sort((a, b) => this.unit(b) - this.unit(a)) ) {
      const u = this.unit(denom);
      if ( u <= 0 ) continue;
      const n = Math.floor(rest / u);
      if ( n > 0 ) { coins[denom] = n; rest -= n * u; }
    }
    return { coins, remainder: rest };
  }

  /**
   * Coarsest single whole-coin representation of a base amount (largest denom that
   * divides it exactly). e.g. 1020 cp → { amount:102, denomination:"sp" }.
   */
  coarsestCoin(baseAmount) {
    const v = Math.max(0, Math.round(baseAmount));
    for ( const denom of this.ordered ) {
      const u = this.unit(denom);
      if ( u > 0 && v % u === 0 ) return { amount: v / u, denomination: denom };
    }
    return { amount: v, denomination: this.baseDenom };
  }

  /**
   * Settlement using ONLY coins each party holds (no creation). Find a buyer payment
   * (subset of `buyerCoins`) and vendor change (subset of `vendorCoins`) with
   * payment − change === priceBase. Returns signed {denom:count} deltas, or null.
   *
   * The buyer overpays by at most one coin's worth, so vendor change is bounded by the
   * largest denomination value; we search that change window for a feasible pairing.
   * (A solution needing change larger than the biggest single coin — pathological purses —
   * is reported as "no change possible".)
   */
  settle(priceBase, buyerCoins = {}, vendorCoins = {}) {
    const P = Math.max(0, Math.round(priceBase));
    if ( P === 0 ) return { buyerDelta: {}, vendorDelta: {} };
    if ( this.bundleToBase(buyerCoins) < P ) return null;

    const cap = Math.max(0, ...this.ordered.map(d => this.unit(d)));
    const buyerSums = this.#reachableSums(buyerCoins, P + cap);
    const vendorSums = this.#reachableSums(vendorCoins, cap);

    for ( let C = 0; C <= cap; C++ ) {
      if ( !vendorSums.has(C) || !buyerSums.has(P + C) ) continue;
      const payment = this.#coinsForSum(buyerCoins, P + C);
      const change  = this.#coinsForSum(vendorCoins, C);
      if ( payment && change ) {
        const buyerDelta = {}, vendorDelta = {};
        for ( const d of this.ordered ) {
          const net = (change[d] ?? 0) - (payment[d] ?? 0);
          if ( net ) buyerDelta[d] = net;
          if ( net ) vendorDelta[d] = -net;
        }
        dbg("CurrencyConverter:settle", "settled", { P, C, payment, change });
        return { buyerDelta, vendorDelta };
      }
    }
    dbg("CurrencyConverter:settle", "no feasible settlement", { P, buyerCoins, vendorCoins });
    return null;
  }

  /** Set of subset-sum base values in [0, max] reachable from a coin bundle (bounded knapsack DP). */
  #reachableSums(coins, max) {
    const reach = new Uint8Array(max + 1); reach[0] = 1;
    for ( const [denom, count] of Object.entries(coins) ) {
      const u = this.unit(denom);
      if ( u <= 0 ) continue;
      for ( let k = 0; k < count; k++ )
        for ( let s = max; s >= u; s-- ) if ( reach[s - u] ) reach[s] = 1;
    }
    const set = new Set();
    for ( let s = 0; s <= max; s++ ) if ( reach[s] ) set.add(s);
    return set;
  }

  /** A concrete {denom:count} subset of `coins` summing exactly to `target`, or null. Greedy largest-first. */
  #coinsForSum(coins, target) {
    let rest = target; const out = {};
    for ( const denom of this.ordered ) {
      const u = this.unit(denom), have = coins[denom] ?? 0;
      if ( u <= 0 || have <= 0 ) continue;
      const n = Math.min(have, Math.floor(rest / u));
      if ( n > 0 ) { out[denom] = n; rest -= n * u; }
    }
    return rest === 0 ? out : null;
  }
}
