const MODULE_ID = "pick-up-stix";

export function getItemIIFlags(item) {
  return item?.flags?.[MODULE_ID] ?? null;
}

export function getItemTokenState(item) {
  return getItemIIFlags(item)?.tokenState ?? null;
}

export function isItemLocked(item) {
  return getItemTokenState(item)?.system?.isLocked === true;
}

export function isItemIdentified(item) {
  return getItemTokenState(item)?.system?.isIdentified !== false;
}

export function getItemSourceActorId(item) {
  return getItemIIFlags(item)?.sourceActorId ?? null;
}
