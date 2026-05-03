const MODULE_ID = "pick-up-stix";

export function isModuleGM() {
  if (!game.user.isGM) return false;
  // Defensive: if settings haven't registered yet (e.g. very early hook),
  // default to "GM behaviour" so we don't accidentally degrade the GM
  // experience during boot.
  try {
    return game.settings.get(MODULE_ID, "gmOverrideEnabled");
  }
  catch {
    return true;
  }
}

export function isPlayerView() {
  return !isModuleGM();
}
