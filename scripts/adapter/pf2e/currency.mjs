import { CurrencyConverter } from "../../utils/CurrencyConverter.mjs";

/** pf2e coin ratios (cp base): 1pp=10gp, 1gp=10sp, 1sp=10cp. No electrum. */
const PF2E_DENOMINATIONS = { pp: 1000, gp: 100, sp: 10, cp: 1 };

/**
 * Build the pf2e currency converter. pf2e denominations are fixed (pp/gp/sp/cp),
 * so the ratios are hard-coded (unlike dnd5e, which reads CONFIG.DND5E.currencies).
 * cp is the base unit; change is generated in pp/gp/sp/cp (pf2e prices routinely
 * run into platinum).
 */
export function buildPf2eCurrencyConverter() {
  return new CurrencyConverter({
    denominations: { ...PF2E_DENOMINATIONS },
    baseDenom: "cp",
    defaultDenom: "gp",
    changeDenoms: ["pp", "gp", "sp", "cp"]
  });
}
