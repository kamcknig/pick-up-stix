import { checkProximity } from "../transfer/ItemTransfer.mjs";
import { isItemLocked } from "./itemFlags.mjs";
import { notifyContainerClosed } from "./notify.mjs";
import { dbg } from "./debugLog.mjs";

export function validateContainerAccess(actor, {
  checkLocked = true,
  checkOpen = true,
  checkProximity: doProximity = false,
  silent = false
} = {}) {
  const sys = actor.system;
  dbg("access:validateContainerAccess", {
    actorName: actor.name, actorId: actor.id,
    checkLocked, checkOpen, doProximity,
    isLocked: sys.isLocked, isContainer: sys.isContainer, isOpen: sys.isOpen
  });
  if (checkLocked && sys.isLocked) {
    dbg("access:validateContainerAccess", "FAIL: actor is locked");
    if (!silent) ui.notifications.warn(sys.lockedDisplayMessage);
    return false;
  }
  if (checkOpen && sys.isContainer && !sys.isOpen) {
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
