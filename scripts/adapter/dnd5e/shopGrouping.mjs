import { getAdapter } from "../index.mjs";
import { dbg } from "../../utils/debugLog.mjs";

/* ---------- dnd5e display helpers (system-specific; kept in the dnd5e adapter) ---------- */

/** Price as { display: ceil(gp), exact: gp, denomination }. */
export function priceInGP(item) {
  const { value, denomination } = item.system?.price ?? {};
  const conv = CONFIG.DND5E.currencies?.[denomination]?.conversion;
  if (!value || !conv) return { display: 0, exact: 0, denomination: denomination ?? "gp" };
  const exact = value / conv;                       // 250 cp / 100 = 2.5 gp
  return { display: Math.ceil(exact), exact, denomination };
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
      const { display, exact } = priceInGP(item);
      const gp = game.i18n.localize("DND5E.CurrencyAbbrGP");
      const fractional = exact !== Math.trunc(exact);
      return {
        text: `${display} ${gp}`,
        tooltip: fractional ? `${Number(exact.toFixed(2))} ${gp}` : null,   // real price when not whole
        classes: "pus-price"
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
    // name (flex) + one track per grouping column + Buy. Phase 2 inserts the qty track.
    columnTemplate: `minmax(0, 1fr) ${columns.map(() => "max-content").join(" ")} max-content`,
    headers: columns.map(c => ({ id: c.id, label: c.header, align: c.align })),
    groups
  };
}

function buildWareRow(item, columns) {
  const description = descriptionSubtitle(item);
  return {
    id: item.id,
    name: item.name,
    img: item.img,
    subtitle: description || typeSubtitle(item),
    stock: getAdapter().getItemQuantity(item),
    cells: columns.map(c => ({ align: c.align, ...c.cell(item) }))
  };
}
