/* ------------------------------------ */
/* Initialize module					*/

import { registerSettings } from "../settings";
import { preloadTemplates } from "../preloadTemplates";
import { tokenRelease } from "../overrides";

/* ------------------------------------ */
export async function initHook() {
	console.log('pick-up-stix | initHook');

	// CONFIG.debug.hooks = true;

	// Assign custom classes and constants here

	// Register custom module settings
	registerSettings();

	// Preload Handlebars templates
	await preloadTemplates();

	Handlebars.registerHelper('capitalize', (input: string) => {
		return `${input[0].toUpperCase()} ${input.slice(1)}`;
	});

	Token.prototype.release = tokenRelease(Token.prototype.release);
};
