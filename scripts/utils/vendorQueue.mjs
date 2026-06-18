import { isVendorActor } from "./actorHelpers.mjs";
import { dbg } from "./debugLog.mjs";

const QUEUE_FLAG = "shoppingQueue";

/** Global mutation lock: serialize every queue read-modify-write (cross-vendor switches touch
 *  multiple actors, so one chain — not a per-vendor one — keeps them consistent). */
let _lock = Promise.resolve();
function _withLock(fn) {
  const next = _lock.then(fn, fn);           // run after the prior op settles (success or failure)
  _lock = next.catch(() => {});
  return next;
}

/** Current queue (array of userIds); never mutate the returned reference. */
export function getVendorQueue(actor) {
  return actor?.getFlag("pick-up-stix", QUEUE_FLAG) ?? [];
}

/** Every vendor actor whose queue currently contains actorId (used to detect "queued elsewhere"). */
export function findUserVendorQueues(actorId) {
  return game.actors.filter(a => isVendorActor(a) && getVendorQueue(a).includes(actorId));
}

/**
 * Append actorId to the back of the vendor's queue, enforcing the single-queue invariant: the actor
 * is first removed from EVERY OTHER vendor's queue. Idempotent. GM-side.
 */
export async function joinVendorQueue(vendorId, actorId) {
  return _withLock(async () => {
    const actor = game.actors.get(vendorId);
    if ( !actor || !isVendorActor(actor) || !actorId ) return;
    // Single-queue: displace the actor from any other vendor they're currently queued in.
    for ( const other of game.actors ) {
      if ( !isVendorActor(other) || other.id === vendorId ) continue;
      const oq = getVendorQueue(other);
      if ( !oq.includes(actorId) ) continue;
      dbg("vendorQueue:join", "displacing from prior queue", { from: other.id, actorId });
      await other.setFlag("pick-up-stix", QUEUE_FLAG, oq.filter(id => id !== actorId));
    }
    const queue = getVendorQueue(actor);
    if ( queue.includes(actorId) ) { dbg("vendorQueue:join", "already queued", { vendorId, actorId }); return; }
    dbg("vendorQueue:join", { vendorId, actorId, from: queue });
    await actor.setFlag("pick-up-stix", QUEUE_FLAG, [...queue, actorId]);
  });
}

/** Remove actorId from the vendor's queue (idempotent). GM-side. */
export async function leaveVendorQueue(vendorId, actorId) {
  return _withLock(async () => {
    const actor = game.actors.get(vendorId);
    if ( !actor || !isVendorActor(actor) || !actorId ) return;
    const queue = getVendorQueue(actor);
    if ( !queue.includes(actorId) ) return;
    dbg("vendorQueue:leave", { vendorId, actorId, from: queue });
    await actor.setFlag("pick-up-stix", QUEUE_FLAG, queue.filter(id => id !== actorId));
  });
}

/** Clear every vendor's queue. Run once by the active GM on `ready` (stale from last session). */
export async function resetAllVendorQueues() {
  for ( const actor of game.actors ) {
    if ( !isVendorActor(actor) ) continue;
    if ( getVendorQueue(actor).length ) {
      dbg("vendorQueue:reset", { vendor: actor.id });
      await actor.setFlag("pick-up-stix", QUEUE_FLAG, []);
    }
  }
}

/** Remove a (disconnected) user's actors from every vendor queue. Active GM only. */
export async function pruneUserFromAllVendorQueues(userId) {
  for ( const vendor of game.actors ) {
    if ( !isVendorActor(vendor) ) continue;
    const queue = getVendorQueue(vendor);
    for ( const actorId of queue ) {
      const shopperActor = game.actors.get(actorId);
      if ( !shopperActor ) continue;
      const level = shopperActor.ownership[userId] ?? 0;
      if ( level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER ) {
        dbg("vendorQueue:prune", { vendor: vendor.id, actorId, userId });
        await leaveVendorQueue(vendor.id, actorId);
      }
    }
  }
}

/** Register GM-only housekeeping. Called once at module init. */
export function registerVendorQueueHooks() {
  Hooks.once("ready", () => {
    if ( !game.user.isActiveGM ) return;
    dbg("vendorQueue:ready", "clearing stale vendor queues");
    resetAllVendorQueues();
  });
  Hooks.on("userConnected", (user, connected) => {
    if ( connected || !game.user.isActiveGM ) return;
    dbg("vendorQueue:userDisconnected", { user: user?.id });
    pruneUserFromAllVendorQueues(user.id);
  });
}

/**
 * Confirm switching the user's queue to a new vendor. ONE button ("Join this queue"); there is no
 * Cancel — dismissing the window (X) resolves false (stay in the prior queue, don't join the new
 * one). Mirrors the module's existing `DialogV2.wait` convention (`quantityPrompt.mjs`).
 *
 * @param {string} newVendorName   - the vendor being opened.
 * @param {string} priorVendorName - the vendor whose queue the user is currently in.
 * @returns {Promise<boolean>} true only when the confirm button is pressed.
 */
export async function promptVendorQueueSwitch(newVendorName, priorVendorName) {
  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.localize("INTERACTIVE_ITEMS.Vendor.Queue.SwitchTitle"),
      classes: ["pus-queue-switch-dialog"]
    },
    content: `<p>${game.i18n.format("INTERACTIVE_ITEMS.Vendor.Queue.SwitchPrompt",
      { from: priorVendorName, to: newVendorName })}</p>`,
    buttons: [{
      action: "confirm",
      label: game.i18n.localize("INTERACTIVE_ITEMS.Vendor.Queue.SwitchConfirm"),
      icon: "fa-solid fa-arrow-right-arrow-left",
      default: true
    }],
    rejectClose: false                  // X dismisses → resolves null → treated as "stay"
  });
  dbg("vendorQueue:promptSwitch", { confirmed: result === "confirm" });
  return result === "confirm";
}
