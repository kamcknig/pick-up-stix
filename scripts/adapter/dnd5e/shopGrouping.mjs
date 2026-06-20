import { getAdapter } from "../index.mjs";
import { dbg } from "../../utils/debugLog.mjs";
import { vendorPriceMultiplier, groupingFactorMultiplier } from "../../utils/vendorPricing.mjs";

/* ---------- dnd5e display helpers (system-specific; kept in the dnd5e adapter) ---------- */

/** Price as { display: ceil(gp), exact: gp, denomination }, scaled by `multiplier`. */
export function priceInGP(item, multiplier = 1) {
  const { value, denomination } = item.system?.price ?? {};
  const conv = CONFIG.DND5E.currencies?.[denomination]?.conversion;
  if (!value || !conv) return { display: 0, exact: 0, denomination: denomination ?? "gp" };
  const exact = (value / conv) * multiplier;
  return { display: Math.ceil(exact), exact, denomination };
}

/**
 * Full per-item cost multiplier: Favor × type-factor × rarity-factor, all compounded.
 * Returns 1 when the item has no vendor parent. Absent factors default to 100% → ×1.0.
 */
export function vendorItemMultiplier(item) {
  const vendor = item?.parent;
  if ( !vendor ) return 1;
  const favorM  = vendorPriceMultiplier(vendor);
  const typeM   = groupingFactorMultiplier(vendor, "type", groupType(item));
  const rarityM = groupingFactorMultiplier(vendor, "rarity", rarityOf(item).key);
  const m = favorM * typeM * rarityM;
  dbg("shopGrouping:vendorItemMultiplier", { item: item.id, favorM, typeM, rarityM, m });
  return m;
}

/** Localized rarity label + raw key. Mundane / unset items are treated as "common". */
export function rarityOf(item) {
  const key = item.system?.rarity || "common";   // dnd5e stores "" for non-magical gear → show Common
  return { key, label: game.i18n.localize(CONFIG.DND5E.itemRarity[key] ?? key) };
}

/** "Martial Melee Weapon" / "Medium Armor" / generic type label. */
export function typeSubtitle(item) {
  const specific = item.system?.type?.label || "";                 // derived, localized
  const generic = game.i18n.localize(CONFIG.Item.typeLabels?.[item.type] ?? "");
  if (!specific) return generic;                                   // tool/loot/container w/o subtype
  return item.type === "weapon" ? `${specific} ${generic}` : specific;
}

/** Item description as full single-line plaintext ("" if none). CSS clamps the
 *  display; the sheet adds a hover tooltip when it's visually truncated. */
export function descriptionSubtitle(item) {
  const html = item.system?.description?.value;                    // HTMLField, nullable
  if (!html) return "";
  const el = document.createElement("div");
  el.innerHTML = String(html);
  el.querySelectorAll("br,p,div,li,h1,h2,h3,h4,h5,h6,tr").forEach(n => n.insertAdjacentText("afterend", " "));
  let text = (el.textContent ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  return text;
}

/** dnd5e item type used for grouping (normalizes the backpack alias). */
function groupType(item) {
  return item.type === "backpack" ? "container" : item.type;
}

/** Ordered list of inventory item-type keys, mirroring dnd5e's section order (no hardcode). */
function inventoryTypeOrder() {
  try {
    return Object.values(CONFIG.Item.dataModels)
      .filter(m => "inventorySection" in m)
      .map(m => ({ order: m.inventorySection.order, type: m.inventorySection.groups?.type }))
      .filter(s => s.type)
      .sort((a, b) => a.order - b.order)
      .map(s => s.type);
  } catch {
    return ["weapon", "equipment", "consumable", "tool", "container", "loot"];
  }
}

/* ---------------------------- Column registry ----------------------------
 * Each column: { id, header (i18n key | ""), align: "start"|"center"|"end",
 *                cell(item) -> { text, tooltip?, classes? } }                */

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
    cell(item) { return { text: `×${getAdapter().getItemQuantity(item)}` }; }   // ×N
  },
  price: {
    id: "price", header: "INTERACTIVE_ITEMS.Vendor.Col.Price", align: "end",
    cell(item) {
      const base = priceInGP(item, 1);
      const sell = priceInGP(item, vendorItemMultiplier(item));
      const gp = game.i18n.localize("DND5E.CurrencyAbbrGP");
      const isNegative = sell.exact < 0;
      const displayValue = Math.max(0, sell.display);
      const fractional = !isNegative && sell.exact !== Math.trunc(sell.exact);
      let classes = "pus-price";
      if ( isNegative && game.user.isGM ) classes += " pus-price-negative";
      else if ( base.exact > 0 && sell.exact < base.exact ) classes += " pus-price-down";
      else if ( base.exact > 0 && sell.exact > base.exact ) classes += " pus-price-up";
      return {
        text: `${displayValue} ${gp}`,
        tooltip: fractional ? `${Number(sell.exact.toFixed(2))} ${gp}` : null,
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
    groupTitleOf: (key) => game.i18n.localize(CONFIG.Item.typeLabels?.[key] ?? key),
    sortGroups(a, b) {                                            // section order, unknowns last (alpha)
      const order = inventoryTypeOrder();
      const ai = order.indexOf(a.key), bi = order.indexOf(b.key);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.title.localeCompare(b.title);
    }
  }
  // Future: add { rarity: {...}, name: {...}, ... } here — each picks COLUMNS + grouping fns.
};

export const DEFAULT_GROUPING = "type";

/* -------------------- Settings-panel dimension registry -------------------- */

/** Ordered rarity keys (dnd5e ladder), unknowns last. */
function rarityOrder() {
  return Object.keys(CONFIG.DND5E.itemRarity ?? {});
}

/** Settings-panel grouping dimensions: how to bucket + label + order items for the factor list. */
export const SETTINGS_DIMENSIONS = {
  type: {
    keyOf: (item) => groupType(item),
    labelOf: (key) => game.i18n.localize(CONFIG.Item.typeLabels?.[key] ?? key),
    order: () => inventoryTypeOrder()
  },
  rarity: {
    keyOf: (item) => rarityOf(item).key,
    labelOf: (key) => game.i18n.localize(CONFIG.DND5E.itemRarity?.[key] ?? key),
    order: () => rarityOrder()
  }
};

/**
 * Buckets `items` by the given settings dimension, returning only buckets that have
 * at least one item, ordered by the dimension's canonical order (unknowns alpha-last).
 * @returns {Array<{ key, label, count }>}
 */
export function buildSettingsGroups(items, dimension) {
  const dim = SETTINGS_DIMENSIONS[dimension] ?? SETTINGS_DIMENSIONS.type;
  const counts = new Map();
  for ( const item of items ) {
    const key = dim.keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const order = dim.order();
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: dim.labelOf(key), count }))
    .sort((a, b) => {
      const ai = order.indexOf(a.key), bi = order.indexOf(b.key);
      if ( ai !== -1 && bi !== -1 ) return ai - bi;
      if ( ai !== -1 ) return -1;
      if ( bi !== -1 ) return 1;
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
  dbg("shopGrouping:buildShop", { groupingId: grouping.id, items: items.length, columns: grouping.columns });

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

function buildWareRow(item, columns) {
  const description = descriptionSubtitle(item);
  const stock = getAdapter().getItemQuantity(item);
  return {
    id: item.id,
    name: item.name,
    img: item.img,
    subtitle: description || typeSubtitle(item),
    stock,
    multiStock: stock > 1,
    shopVisible: item.getFlag("pick-up-stix", "shopVisible") !== false,
    cells: columns.map(c => ({ align: c.align, ...c.cell(item) }))
  };
}
