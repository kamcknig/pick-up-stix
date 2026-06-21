import { CurrencyConverter } from "../../utils/CurrencyConverter.mjs";

/** Canonical dnd5e ratios (cp base) used when CONFIG is unavailable: 1pp=10gp=20ep=100sp=1000cp. */
const FALLBACK = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };

/**
 * Build the dnd5e currency converter from CONFIG.DND5E.currencies (respecting any
 * homebrew edits), falling back to the canonical table. cp-per-coin = 100 / conversion.
 * Change generation stays gp/sp/cp to preserve today's tidy change.
 */
export function buildDnd5eCurrencyConverter() {
  const cfg = CONFIG.DND5E?.currencies;
  let denominations = null;
  if ( cfg ) {
    denominations = {};
    for ( const [denom, data] of Object.entries(cfg) ) {
      const conv = Number(data?.conversion);
      if ( conv > 0 ) denominations[denom] = 100 / conv;
    }
  }
  if ( !denominations || !denominations.cp ) denominations = { ...FALLBACK };
  return new CurrencyConverter({
    denominations,
    baseDenom: "cp",
    defaultDenom: CONFIG.DND5E?.defaultCurrency || "gp",
    changeDenoms: ["gp", "sp", "cp"]
  });
}
