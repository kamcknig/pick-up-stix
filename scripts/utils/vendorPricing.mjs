import { dbg } from "./debugLog.mjs";

/**
 * Vendor "Favor": how favourably a vendor prices for the party. Stored as the actor
 * flag `flags.pick-up-stix.favor`. Each point shifts cost by FAVOR_STEP_PERCENT%:
 * positive Favor discounts, negative Favor surcharges. Kept system-agnostic — the
 * dnd5e adapter applies the multiplier to its own currency math.
 */
/** Hard-coded defaults — used as setting registration defaults and as fallbacks before `init`. */
export const FAVOR_MIN = -5;
export const FAVOR_MAX = 5;
export const FAVOR_FACTOR_MIN = 1;
export const FAVOR_FACTOR_MAX = 20;
export const FAVOR_FACTOR_DEFAULT = 4;

// Runtime setting readers — fall back to the constants when settings aren't available yet.
const gs = (key, fallback) => { try { return game.settings.get("pick-up-stix", key); } catch { return fallback; } };

/** Configured minimum Favor value (module setting `vendorFavorMin`, default −5). */
export const getFavorMin = () => gs("vendorFavorMin", FAVOR_MIN);
/** Configured maximum Favor value (module setting `vendorFavorMax`, default 5). */
export const getFavorMax = () => gs("vendorFavorMax", FAVOR_MAX);
/** Configured minimum Favor Factor (module setting `vendorFavorFactorMin`, default 1). */
export const getFavorFactorMin = () => gs("vendorFavorFactorMin", FAVOR_FACTOR_MIN);
/** Configured maximum Favor Factor (module setting `vendorFavorFactorMax`, default 20). */
export const getFavorFactorMax = () => gs("vendorFavorFactorMax", FAVOR_FACTOR_MAX);
/** Configured default Favor Factor (module setting `vendorFavorFactorDefault`, default 4). */
export const getFavorFactorDefault = () => gs("vendorFavorFactorDefault", FAVOR_FACTOR_DEFAULT);

/** A vendor's Favor, clamped to the configured [favorMin, favorMax]; absent / non-numeric → 0. */
export function getVendorFavor(vendor) {
  const raw = Number(vendor?.getFlag?.("pick-up-stix", "favor"));
  if ( !Number.isFinite(raw) ) return 0;
  return Math.max(getFavorMin(), Math.min(getFavorMax(), Math.round(raw)));
}

/** A vendor's Favor factor (% per point), clamped to [favorFactorMin, favorFactorMax]; absent → favorFactorDefault. */
export function getVendorFavorFactor(vendor) {
  const raw = Number(vendor?.getFlag?.("pick-up-stix", "favorFactor"));
  if ( !Number.isFinite(raw) ) return getFavorFactorDefault();
  return Math.max(getFavorFactorMin(), Math.min(getFavorFactorMax(), Math.round(raw)));
}

/**
 * Cost multiplier for a Favor value: `1 - (favor * factor) / 100`.
 * e.g. favor +5, factor 4 → 0.80 (20% off); favor -5, factor 4 → 1.20 (20% surcharge).
 */
export function favorMultiplier(favor, factor = getFavorFactorDefault()) {
  return 1 - (favor * factor) / 100;
}

/** Convenience: the cost multiplier for a vendor actor (reads + clamps both flags). */
export function vendorPriceMultiplier(vendor) {
  const favor = getVendorFavor(vendor);
  const factor = getVendorFavorFactor(vendor);
  const m = favorMultiplier(favor, factor);
  dbg("vendorPricing:multiplier", { vendor: vendor?.id, favor, factor, multiplier: m });
  return m;
}
