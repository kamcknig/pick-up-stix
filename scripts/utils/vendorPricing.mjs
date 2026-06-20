import { dbg } from "./debugLog.mjs";

/**
 * Vendor "Favor": how favourably a vendor prices for the party. Stored as the actor
 * flag `flags.pick-up-stix.favor`. Each point shifts cost by FAVOR_STEP_PERCENT%:
 * positive Favor discounts, negative Favor surcharges. Kept system-agnostic — the
 * dnd5e adapter applies the multiplier to its own currency math.
 */
/** Hard-coded fallback for max Favor — used before `init` and as setting default. */
export const FAVOR_MAX = 5;
export const FAVOR_FACTOR_MAX = 20;
/** Hard-coded fallback for the max per-grouping price factor (percent). */
export const PRICE_FACTOR_MAX = 500;
/** Default per-grouping price factor (percent); 100 = ×1.00 = no change. */
export const PRICE_FACTOR_DEFAULT = 100;

// Runtime setting reader — falls back to the constant when settings aren't available yet.
const gs = (key, fallback) => { try { return game.settings.get("pick-up-stix", key); } catch { return fallback; } };

/** Configured maximum Favor value (module setting `vendorFavorMax`, default 5). */
export const getFavorMax = () => gs("vendorFavorMax", FAVOR_MAX);
/** Minimum Favor — always the negative of the max. */
export const getFavorMin = () => -getFavorMax();
/** Minimum Favor Factor — always 1. */
export const getFavorFactorMin = () => 1;
/** Configured maximum Favor Factor (module setting `vendorFavorFactorMax`, default 20). */
export const getFavorFactorMax = () => gs("vendorFavorFactorMax", FAVOR_FACTOR_MAX);
/** Default Favor Factor when a vendor has none set — always 1. */
export const getFavorFactorDefault = () => 1;
/** Configured maximum per-grouping price factor (module setting `vendorMaxPriceFactor`, default 500). */
export const getMaxPriceFactor = () => gs("vendorMaxPriceFactor", PRICE_FACTOR_MAX);

/** A vendor's stored global price factor (percent), clamped to [0, maxPriceFactor]; absent → 100. */
export function getVendorGlobalFactor(vendor) {
  const raw = Number(vendor?.getFlag?.("pick-up-stix", "globalPriceFactor"));
  if ( !Number.isFinite(raw) ) return PRICE_FACTOR_DEFAULT;
  return Math.max(0, Math.min(getMaxPriceFactor(), Math.round(raw)));
}

/** Cost multiplier for the global factor: factor% / 100 (default → 1.0). */
export function globalFactorMultiplier(vendor) {
  return getVendorGlobalFactor(vendor) / 100;
}

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

/**
 * A vendor's stored price factor (percent) for one grouping bucket, clamped to
 * [0, maxPriceFactor]; absent / non-numeric → PRICE_FACTOR_DEFAULT (100).
 * @param {Actor} vendor
 * @param {"type"|"rarity"} dimension
 * @param {string} key  grouping bucket key (e.g. "weapon", "rare")
 */
export function getVendorGroupingFactor(vendor, dimension, key) {
  const raw = Number(vendor?.getFlag?.("pick-up-stix", `groupingFactors.${dimension}.${key}`));
  if ( !Number.isFinite(raw) ) return PRICE_FACTOR_DEFAULT;
  return Math.max(0, Math.min(getMaxPriceFactor(), Math.round(raw)));
}

/** Cost multiplier for one grouping bucket: factor% / 100 (default → 1.0). */
export function groupingFactorMultiplier(vendor, dimension, key) {
  return getVendorGroupingFactor(vendor, dimension, key) / 100;
}
