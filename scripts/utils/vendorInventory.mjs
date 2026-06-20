import { getAdapter } from "../adapter/index.mjs";
import { dbg } from "./debugLog.mjs";

const DEFAULT_INVENTORY_FLAG = "defaultInventory";

/** Saved default-inventory snapshot (array of item source objects), or null when none saved. */
export function getDefaultInventory(vendor) {
  const snap = vendor?.getFlag("pick-up-stix", DEFAULT_INVENTORY_FLAG);
  return Array.isArray(snap) ? snap : null;
}

/** True when this vendor has a saved default inventory. */
export function hasDefaultInventory(vendor) {
  return getDefaultInventory(vendor) !== null;
}

/**
 * Snapshot the vendor's current PHYSICAL items as its default inventory. Stores full item source
 * (toObject, _id included) so a sold-out item can be recreated faithfully on restock. Overwrites
 * any prior default. GM-side. Returns the number of items saved.
 */
export async function saveDefaultInventory(vendor) {
  const adapter = getAdapter();
  const snapshot = vendor.items.filter(i => adapter.isPhysicalItem(i)).map(i => i.toObject());
  dbg("vendorInventory:save", { vendor: vendor.id, count: snapshot.length });
  await vendor.setFlag("pick-up-stix", DEFAULT_INVENTORY_FLAG, snapshot);
  return snapshot.length;
}

/**
 * Diff the vendor's current physical inventory against its saved default, matched by item _id
 * (stock decrements in place on sale, so a partly-sold item keeps its _id; a sold-out one is gone).
 * Returns null when no default is saved.
 *
 * @returns {{toCreate: object[], toIncrease: {id:string,to:number}[],
 *            extraQty: {id:string,name:string,from:number,to:number}[],
 *            extraItems: {id:string,name:string,qty:number}[]} | null}
 */
export function computeRestockDiff(vendor) {
  const snap = getDefaultInventory(vendor);
  if ( !snap ) return null;
  const adapter = getAdapter();
  const qtyOf = (src) => Number(foundry.utils.getProperty(src, "system.quantity")) || 0;

  const current = new Map(vendor.items.filter(i => adapter.isPhysicalItem(i)).map(i => [i.id, i]));
  const defaultIds = new Set();
  const toCreate = [], toIncrease = [], extraQty = [];

  for ( const src of snap ) {
    defaultIds.add(src._id);
    const want = qtyOf(src);
    const item = current.get(src._id);
    if ( !item ) { toCreate.push(src); continue; }              // sold out / deleted → recreate
    const have = adapter.getItemQuantity(item);
    if ( have < want ) toIncrease.push({ id: item.id, to: want });
    else if ( have > want ) extraQty.push({ id: item.id, name: item.name, from: have, to: want });
  }

  const extraItems = [];
  for ( const [id, item] of current ) {
    if ( !defaultIds.has(id) ) extraItems.push({ id, name: item.name, qty: adapter.getItemQuantity(item) });
  }

  dbg("vendorInventory:diff", {
    vendor: vendor.id, create: toCreate.length, increase: toIncrease.length,
    extraQty: extraQty.length, extraItems: extraItems.length
  });
  return { toCreate, toIncrease, extraQty, extraItems };
}

/**
 * Apply a restock. ALWAYS performs the additive part (recreate missing, top up low stacks). Removes
 * extras (excess quantity + items absent from the default) only when removeExtras is true. GM-side.
 */
export async function applyRestock(vendor, diff, { removeExtras }) {
  const { toCreate, toIncrease, extraQty, extraItems } = diff;

  if ( toCreate.length )
    await vendor.createEmbeddedDocuments("Item", toCreate, { keepId: true });
  if ( toIncrease.length )
    await vendor.updateEmbeddedDocuments("Item", toIncrease.map(u => ({ _id: u.id, "system.quantity": u.to })));

  if ( removeExtras ) {
    if ( extraQty.length )
      await vendor.updateEmbeddedDocuments("Item", extraQty.map(u => ({ _id: u.id, "system.quantity": u.to })));
    if ( extraItems.length )
      await vendor.deleteEmbeddedDocuments("Item", extraItems.map(e => e.id));
  }

  dbg("vendorInventory:applyRestock", { vendor: vendor.id, removeExtras,
    created: toCreate.length, increased: toIncrease.length,
    extraQty: extraQty.length, extraItems: extraItems.length });
  return {
    created: toCreate.length, increased: toIncrease.length,
    removed: removeExtras ? (extraQty.length + extraItems.length) : 0
  };
}

/**
 * Confirm removing the listed extras. "Remove extras" + "Keep extras" buttons; the X dismiss
 * resolves false (keep). Mirrors promptVendorQueueSwitch's DialogV2.wait convention.
 *
 * @returns {Promise<boolean>} true only when "Remove extras" is pressed.
 */
export async function promptRestockRemoval({ extraQty, extraItems }) {
  const rows = [
    ...extraQty.map(e => game.i18n.format("INTERACTIVE_ITEMS.Vendor.RestockExtraQtyRow",
      { name: e.name, remove: e.from - e.to })),
    ...extraItems.map(e => game.i18n.format("INTERACTIVE_ITEMS.Vendor.RestockExtraItemRow",
      { name: e.name, qty: e.qty }))
  ];
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize("INTERACTIVE_ITEMS.Vendor.RestockConfirmTitle") },
    content: `<p>${game.i18n.localize("INTERACTIVE_ITEMS.Vendor.RestockConfirmPrompt")}</p>`
      + `<ul>${rows.map(r => `<li>${r}</li>`).join("")}</ul>`,
    buttons: [
      { action: "remove", default: true, icon: "fa-solid fa-trash",
        label: game.i18n.localize("INTERACTIVE_ITEMS.Vendor.RestockRemove") },
      { action: "keep", icon: "fa-solid fa-box",
        label: game.i18n.localize("INTERACTIVE_ITEMS.Vendor.RestockKeep") }
    ],
    rejectClose: false
  });
  dbg("vendorInventory:promptRestockRemoval", { result });
  return result === "remove";
}
