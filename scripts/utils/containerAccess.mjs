import { checkProximity } from "../transfer/ItemTransfer.mjs";
import { isItemLocked } from "./itemFlags.mjs";
import { notifyContainerClosed } from "./notify.mjs";
import { getAdapter } from "../adapter/index.mjs";
import { dbg } from "./debugLog.mjs";

export function validateContainerAccess(actor, {
  checkLocked = true,
  checkOpen = true,
  checkProximity: doProximity = false,
  silent = false
} = {}) {
  // Route all state reads through the adapter so generic mode (where the
  // actor's system fields are absent because the system wiped our data
  // model) gets the same gates as the model-backed adapters.
  const adapter = getAdapter();
  const isLocked = adapter.isInteractiveLocked(actor);
  const isContainer = adapter.isInteractiveContainer(actor);
  const isOpen = adapter.isInteractiveOpen(actor);
  dbg("access:validateContainerAccess", {
    actorName: actor.name, actorId: actor.id,
    checkLocked, checkOpen, doProximity,
    isLocked, isContainer, isOpen
  });
  if (checkLocked && isLocked) {
    dbg("access:validateContainerAccess", "FAIL: actor is locked");
    if (!silent) ui.notifications.warn(adapter.getInteractiveLockedMessage(actor));
    return false;
  }
  if (checkOpen && isContainer && !isOpen) {
    dbg("access:validateContainerAccess", "FAIL: container is closed");
    if (!silent) notifyContainerClosed();
    return false;
  }
  if (doProximity && !checkProximity(actor, { silent })) {
    dbg("access:validateContainerAccess", "FAIL: proximity check failed");
    return false;
  }
  dbg("access:validateContainerAccess", "PASS");
  return true;
}

export function validateItemAccess(item, { silent = false } = {}) {
  const locked = isItemLocked(item);
  dbg("access:validateItemAccess", { itemName: item?.name, itemId: item?.id, isLocked: locked });
  if (locked) {
    dbg("access:validateItemAccess", "FAIL: item is locked");
    if (!silent) ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.ItemLocked"));
    return false;
  }
  dbg("access:validateItemAccess", "PASS");
  return true;
}
