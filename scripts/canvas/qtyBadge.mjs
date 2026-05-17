import { getAdapter } from "../adapter/index.mjs";
import { isInteractiveActor } from "../utils/actorHelpers.mjs";
import { dbg } from "../utils/debugLog.mjs";

/** Property key used to store the badge PreciseText on the Token placeable. */
const PROP = "pickUpStixQty";

/**
 * True if the badge should be drawn on this token. Excludes non-interactive
 * actors, container-mode interactive actors (they carry a single backpack
 * item and shouldn't show a count), and tokens whose actor failed to resolve.
 *
 * @param {Token} token
 * @returns {boolean}
 */
function isEligibleToken(token) {
  const actor = token.actor;
  if (!isInteractiveActor(actor)) return false;
  return !getAdapter().isInteractiveContainer(actor);
}

/**
 * Resolve the current stack quantity to display on the token. Works for
 * both model-backed adapters (read from the embedded item via the adapter)
 * and the generic adapter (read from `flags["pick-up-stix"].interactive
 * .itemData.quantity`).
 *
 * @param {Token} token
 * @returns {number}
 */
function getDisplayQuantity(token) {
  const actor = token.actor;
  if (!actor) return 1;
  const adapter = getAdapter();
  if (adapter.constructor.SYSTEM_ID === "generic") {
    return adapter.getInteractiveData(actor).itemData?.quantity ?? 1;
  }
  const item = actor.system?.embeddedItem;
  return item ? adapter.getItemQuantity(item) : 1;
}

/**
 * Build a text style for the quantity badge. Clones Foundry's canvas
 * text style and adjusts weight, size, and stroke so the number reads
 * clearly against any token art.
 *
 * @returns {PIXI.TextStyle}
 */
function buildStyle() {
  const style = CONFIG.canvasTextStyle.clone();
  style.fontSize = 28;
  style.fontWeight = "bold";
  style.fill = 0xFFFFFF;
  style.stroke = 0x000000;
  style.strokeThickness = 4;
  return style;
}

/**
 * Position the badge in the bottom-right corner of the token, inset
 * slightly so the stroke is not clipped by the token boundary.
 *
 * @param {Token} token
 */
function position(token) {
  const badge = token[PROP];
  if (!badge) return;
  const { width, height } = token.document.getSize();
  // anchor(1,1) on the text puts the bottom-right of the text at this point.
  badge.position.set(width - 4, height - 4);
}

/**
 * Refresh the numeric text and visibility of the badge.  The badge is
 * hidden when qty <= 1 or the token is secret (disposition hidden).
 *
 * @param {Token} token
 */
function updateText(token) {
  const badge = token[PROP];
  if (!badge) return;
  const qty = getDisplayQuantity(token);
  const visible = qty > 1 && !token.document.isSecret;
  badge.text = String(qty);
  badge.visible = visible;
  dbg("badge:updateText", { tokenId: token.id, qty, visible });
}

/**
 * Register the Token hooks that drive the quantity badge.
 *
 * - `drawToken`   — create the PreciseText child the first time the token
 *                   is drawn.
 * - `refreshToken` — reposition on size change; update text on state change.
 * - `updateItem`  — refresh text when the embedded item's quantity changes.
 * - `updateActor` — refresh text when identification state flips (future-proof
 *                   for systems that want to mask the count when unidentified).
 */
export function registerQtyBadge() {
  Hooks.on("drawToken", (token) => {
    if (!isEligibleToken(token)) return;
    dbg("badge:drawToken", { tokenId: token.id });
    const PreciseText = foundry.canvas.containers.PreciseText;
    const badge = new PreciseText("", buildStyle());
    badge.anchor.set(1, 1);
    badge.scale.set(canvas.dimensions.uiScale);
    // zIndex above the hover border so the number is always legible.
    badge.zIndex = 10;
    token[PROP] = token.addChild(badge);
    position(token);
    updateText(token);
  });

  Hooks.on("refreshToken", (token, flags) => {
    if (!token[PROP]) return;
    if (flags?.refreshSize) position(token);
    if (flags?.refreshState) updateText(token);
  });

  // Model-backed: quantity lives on the embedded item; refresh when it changes.
  Hooks.on("updateItem", (item, changes) => {
    if (!foundry.utils.hasProperty(changes ?? {}, "system.quantity")) return;
    dbg("badge:updateItem", { itemId: item.id, qty: changes.system.quantity });
    for (const token of canvas.tokens?.placeables ?? []) {
      const embedded = token.actor?.system?.embeddedItem;
      if (embedded?.id === item.id) updateText(token);
    }
  });

  // Refresh on actor updates that could affect the displayed quantity or
  // visibility: model-backed identification flips, and generic-mode flag
  // changes (which is where the qty lives when there's no embedded item).
  Hooks.on("updateActor", (actor, changes) => {
    if (!isInteractiveActor(actor)) return;
    const idChanged = foundry.utils.hasProperty(changes ?? {}, "system.isIdentified");
    const flagChanged = foundry.utils.hasProperty(changes ?? {}, "flags.pick-up-stix.interactive");
    if (!idChanged && !flagChanged) return;
    for (const token of canvas.tokens?.placeables ?? []) {
      if (token.actor?.id === actor.id) updateText(token);
    }
  });
}
