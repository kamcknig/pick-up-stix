import { getAdapter } from "../index.mjs";
import { dbg } from "../../utils/debugLog.mjs";
import { vendorPriceMultiplier, groupingFactorMultiplier, globalFactorMultiplier } from "../../utils/vendorPricing.mjs";

/* ---------- pf2e display / pricing helpers (system-specific) ----------
 * The favor / global / grouping factor MATH lives in the shared vendorPricing
 * helpers (system-agnostic, unitless multipliers). Only the bucket-key
 * derivation, rarity/type vocabulary, and currency reads below are pf2e-specific.
 * pf2e item price is `system.price.value` (a {pp,gp,sp,cp} object) priced per
 * `system.price.per` units. */

/**
 * Per-unit base price in copper, via the shared converter.
 * pf2e prices a batch of `per` units for `value`, so unit price = value / per.
 *
 * @param {Item} item
 * @returns {number} copper pieces per single unit (0 when unpriced)
 */
export function basePriceCp(item) {
  const value = item?.system?.price?.value ?? {};
  const per = Math.max(1, Number(item?.system?.price?.per ?? 1));
  const conv = getAdapter().currency;
  if (!conv) return 0;
  return conv.bundleToBase(value) / per;
}

/**
 * Full per-item cost multiplier: Favor × global × type-factor × rarity-factor,
 * all compounded. Returns 1 when the item has no vendor parent.
 *
 * @param {Item} item
 * @returns {number}
 */
export function vendorItemMultiplier(item) {
  const vendor = item?.parent;
  if (!vendor) return 1;
  const favorM  = vendorPriceMultiplier(vendor);
  const globalM = globalFactorMultiplier(vendor);
  const typeM   = groupingFactorMultiplier(vendor, "type", groupType(item));
  const rarityM = groupingFactorMultiplier(vendor, "rarity", rarityOf(item).key);
  const m = favorM * globalM * typeM * rarityM;
  dbg("pf2e-shopGrouping:vendorItemMultiplier", { item: item.id, favorM, globalM, typeM, rarityM, m });
  return m;
}

/** Localized rarity label + raw key. pf2e rarity lives at system.traits.rarity. */
export function rarityOf(item) {
  const key = item.system?.traits?.rarity || "common";
  const label = game.i18n.localize(CONFIG.PF2E?.rarityTraits?.[key] ?? key);
  return { key, label };
}

/** pf2e item type used for grouping (weapon/armor/consumable/backpack/treasure/…). */
function groupType(item) {
  return item.type;
}

/** Localized document sub-type label (Foundry-standard TYPES.Item.* keys). */
export function typeSubtitle(item) {
  return game.i18n.localize(`TYPES.Item.${item.type}`);
}

/** Item description as single-line plaintext ("" if none). CSS clamps the visible
 *  line; the full description appears in the ware's hover item card. */
export function descriptionSubtitle(item) {
  const html = item.system?.description?.value;
  if (!html) return "";
  const el = document.createElement("div");
  el.innerHTML = String(html);
  el.querySelectorAll("br,p,div,li,h1,h2,h3,h4,h5,h6,tr").forEach(n => n.insertAdjacentText("afterend", " "));
  return (el.textContent ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/* ---------------------------- Column registry ----------------------------
 * Each column: { id, header (i18n key | ""), align: "start"|"center"|"end",
 *                cell(item) -> { text, tooltip?, classes?, coins? } }            */

const COLUMNS = {
  rarity: {
    id: "rarity", header: "INTERACTIVE_ITEMS.Vendor.Col.Rarity", align: "center",
    cell(item) {
      const { key, label } = rarityOf(item);
      return label ? { text: label, classes: `pus-rarity pus-rarity-${key}` } : { text: "" };
    }
  },
  stock: {
    id: "stock", header: "INTERACTIVE_ITEMS.Vendor.Col.Stock", align: "center",
    cell(item) { return { text: `×${getAdapter().getItemQuantity(item)}` }; }
  },
  price: {
    id: "price", header: "INTERACTIVE_ITEMS.Vendor.Col.Price", align: "end",
    cell(item) {
      const conv = getAdapter().currency;
      const base = basePriceCp(item);
      if (!base || !conv) return { text: "0", classes: "pus-price" };

      // Exact cp after factors, then float-safe ceil: kills noise (237.0000001 → 237)
      // and rounds any genuine sub-cp fraction up — only the smallest denomination is
      // bumped. Matches getItemChargeCp so display === what the player pays.
      const exactCp = base * vendorItemMultiplier(item);
      const sellBase = Math.max(0, Math.ceil(Math.round(exactCp * 1e4) / 1e4));

      let classes = "pus-price";
      if (base > 0 && sellBase < base) classes += " pus-price-down";
      else if (base > 0 && sellBase > base) classes += " pus-price-up";

      // A free ware shows a bare "0" — no denomination/coin appended.
      if (sellBase <= 0) return { text: "0", classes };

      const { coins } = conv.decompose(sellBase);
      const coinEntries = conv.changeDenoms.filter(d => coins[d]).map(d => ({
        amount: coins[d], denom: d,
        label: game.i18n.localize(`PF2E.Currency.${d}`)
      }));
      return {
        text: coinEntries.map(c => `${c.amount} ${c.denom}`).join(" "),
        coins: coinEntries,
        classes
      };
    }
  }
};

/* ---------------------------- Grouping registry ---------------------------- */

export const SHOP_GROUPINGS = {
  type: {
    id: "type",
    label: "INTERACTIVE_ITEMS.Vendor.Group.Type",
    columns: ["rarity", "stock", "price"],
    groupKeyOf: (item) => groupType(item),
    groupTitleOf: (key) => game.i18n.localize(`TYPES.Item.${key}`),
    sortGroups(a, b) { return a.title.localeCompare(b.title); }  // pf2e: alpha
  }
  // Future: add { rarity: {...}, name: {...}, ... } here — each picks COLUMNS + grouping fns.
};

export const DEFAULT_GROUPING = "type";

/* -------------------- Settings-panel dimension registry -------------------- */

/** Settings-panel grouping dimensions: how to bucket + label + order items for the factor list. */
export const SETTINGS_DIMENSIONS = {
  type: {
    keyOf: (item) => groupType(item),
    labelOf: (key) => game.i18n.localize(`TYPES.Item.${key}`),
    order: () => []                                              // alpha fallback (no canonical order)
  },
  rarity: {
    keyOf: (item) => rarityOf(item).key,
    labelOf: (key) => rarityOf({ system: { traits: { rarity: key } } }).label,
    order: () => ["common", "uncommon", "rare", "unique"]
  }
};

/**
 * Buckets `items` by the given settings dimension, returning only buckets that have
 * at least one item, ordered by the dimension's canonical order (unknowns alpha-last).
 *
 * @returns {Array<{ key, label, count }>}
 */
export function buildSettingsGroups(items, dimension) {
  const dim = SETTINGS_DIMENSIONS[dimension] ?? SETTINGS_DIMENSIONS.type;
  const counts = new Map();
  for (const item of items) {
    const key = dim.keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const order = dim.order();
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: dim.labelOf(key), count }))
    .sort((a, b) => {
      const ai = order.indexOf(a.key), bi = order.indexOf(b.key);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.label.localeCompare(b.label);
    });
}

/* ------------------------ Build the grouped structure ------------------------ */

/**
 * @returns {{ groupingId, columnTemplate, headers, groups }}
 *   headers: [{ id, label, align }]   columnTemplate: a grid-template-columns string
 *   groups:  [{ key, title, wares: [wareRow] }]
 */
export function buildShop(items, groupingId = DEFAULT_GROUPING) {
  const grouping = SHOP_GROUPINGS[groupingId] ?? SHOP_GROUPINGS[DEFAULT_GROUPING];
  const columns = grouping.columns.map(id => COLUMNS[id]);
  dbg("pf2e-shopGrouping:buildShop", { groupingId: grouping.id, items: items.length, columns: grouping.columns });

  const buckets = new Map();
  for (const item of items) {
    const key = grouping.groupKeyOf(item);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  const groups = [...buckets.entries()].map(([key, groupItems]) => ({
    key,
    title: grouping.groupTitleOf(key),
    wares: groupItems
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(item => buildWareRow(item, columns))
  }));
  groups.sort((a, b) => grouping.sortGroups(a, b));

  return {
    groupingId: grouping.id,
    // name (flex) + one track per grouping column + GM visibility toggle + basket + Buy
    columnTemplate: `minmax(0, 1fr) ${columns.map(() => "max-content").join(" ")} max-content max-content max-content`,
    headers: columns.map(c => ({ id: c.id, label: c.header, align: c.align })),
    groups
  };
}

/**
 * Build the shop structure from pf2e's prepared inventory sections (the exact
 * sections/labels/order the Inventory tab shows — Weapons & Shields, Armor,
 * Equipment, Consumables, Ammunition, Treasure, Containers), so the Shop groups
 * match the inventory categories. Empty sections are kept (the inventory shows
 * them too).
 *
 * @param {Array<{label:string, types:string[], items:Array<{item:Item}>}>} sections
 * @param {string} [groupingId]
 * @param {{includeHidden?: boolean, rarity?: string}} [options]  includeHidden=false drops
 *   GM-hidden wares (`flags.pick-up-stix.shopVisible === false`) — the player storefront;
 *   rarity (when set) keeps only that rarity and drops the now-empty sections.
 * @returns {{ groupingId, headers, groups }}
 */
export function buildShopFromSections(sections, groupingId = DEFAULT_GROUPING, { includeHidden = true, rarity = "" } = {}) {
  const grouping = SHOP_GROUPINGS[groupingId] ?? SHOP_GROUPINGS[DEFAULT_GROUPING];
  const columns = grouping.columns.map(id => COLUMNS[id]);
  dbg("pf2e-shopGrouping:buildShopFromSections", { sections: sections?.length ?? 0, includeHidden, rarity });
  let groups = (sections ?? []).map(section => ({
    key: (section.types ?? []).join("-"),
    title: section.label,
    wares: (section.items ?? [])
      .map(row => row?.item)
      .filter(Boolean)
      .filter(item => !item.isCurrency) // a vendor doesn't sell its own coins
      .filter(item => includeHidden || item.getFlag("pick-up-stix", "shopVisible") !== false)
      .filter(item => !rarity || rarityOf(item).key === rarity) // rarity filter (when set)
      .map(item => buildWareRow(item, columns))
  }));
  // With a rarity filter active, drop now-empty sections so only matching categories
  // show; an all-empty result falls through to the template's Empty state.
  if (rarity) groups = groups.filter(g => g.wares.length > 0);
  return {
    groupingId: grouping.id,
    headers: columns.map(c => ({ id: c.id, label: c.header, align: c.align })),
    groups
  };
}

function buildWareRow(item, columns) {
  const description = descriptionSubtitle(item);
  const stock = getAdapter().getItemQuantity(item);
  return {
    id: item.id,
    name: item.name,
    img: item.img,
    subtitle: description || typeSubtitle(item),
    rarity: rarityOf(item).key,
    stock,
    multiStock: stock > 1,
    shopVisible: item.getFlag("pick-up-stix", "shopVisible") !== false,
    cells: columns.map(c => ({ align: c.align, id: c.id, ...c.cell(item) }))
  };
}
