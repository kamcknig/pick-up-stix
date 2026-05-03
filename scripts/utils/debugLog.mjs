const MODULE_ID = "pick-up-stix";

export function dbg(tag, ...args) {
  // Guard against calls before settings are registered (during init).
  if (!game.settings?.settings?.has(`${MODULE_ID}.debugLogging`)) return;
  if (!game.settings.get(MODULE_ID, "debugLogging")) return;
  console.log(`[PUS] ${tag}`, ...args);
}
