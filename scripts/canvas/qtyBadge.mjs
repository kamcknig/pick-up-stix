import { getAdapter } from "../adapter/index.mjs";
import { isInteractiveActor } from "../utils/actorHelpers.mjs";
import { dbg } from "../utils/debugLog.mjs";

/** Property key used to store the badge PreciseText on the Token placeable. */
const PROP = "pickUpStixQty";

/**
 * Resolve the embedded item the badge should track, or null when the
 * token is not an eligible interactive item. Containers and base actors
 * (no token) are excluded — containers always carry a single backpack
 * item and should never show the badge.
 *
 * @param {Token} token - The PIXI Token placeable.
 * @returns {Item|null}
 */
function getInteractiveItem(token) {
  const actor = token.actor;
  if (!isInteractiveActor(actor)) return null;
  if (actor.system?.isContainer) return null;
  return actor.system?.embeddedItem ?? null;
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
  const item = getInteractiveItem(token);
  const qty = item ? getAdapter().getItemQuantity(item) : 1;
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
    if (!getInteractiveItem(token)) return;
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

  Hooks.on("updateItem", (item, changes) => {
    if (!foundry.utils.hasProperty(changes ?? {}, "system.quantity")) return;
    dbg("badge:updateItem", { itemId: item.id, qty: changes.system.quantity });
    for (const token of canvas.tokens?.placeables ?? []) {
      const embedded = getInteractiveItem(token);
      if (embedded?.id === item.id) updateText(token);
    }
  });

  // Identification flips can change what the badge should show on systems
  // that mask the count when unidentified. Refresh on the wrapping actor's
  // identification change as a forward-compatible hook.
  Hooks.on("updateActor", (actor, changes) => {
    if (!isInteractiveActor(actor)) return;
    if (!foundry.utils.hasProperty(changes ?? {}, "system.isIdentified")) return;
    for (const token of canvas.tokens?.placeables ?? []) {
      if (token.actor?.id === actor.id) updateText(token);
    }
  });
}
