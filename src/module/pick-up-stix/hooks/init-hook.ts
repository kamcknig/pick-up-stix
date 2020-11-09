/* ------------------------------------ */
/* Initialize module					*/

import { registerSettings } from "../settings";
import { preloadTemplates } from "../preloadTemplates";
import { tokenRelease } from "../overrides";
import { log } from "../../../log";

/* ------------------------------------ */
export async function initHook() {
	log('pick-up-stix | initHook');

	CONFIG.debug.hooks = true;

	// Assign custom classes and constants here

	// Register custom module settings
	registerSettings();

	// Preload Handlebars templates
	await preloadTemplates();

	Token.prototype.release = tokenRelease(Token.prototype.release);
};
