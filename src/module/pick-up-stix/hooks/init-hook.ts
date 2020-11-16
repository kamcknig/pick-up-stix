/* ------------------------------------ */
/* Initialize module					*/

import { registerSettings } from "../settings";
import { preloadTemplates } from "../preloadTemplates";
import { Token_isVisible, Token_tokenRelease } from "../overrides";
import { info, log } from "../../../log";

/* ------------------------------------ */
export async function initHook() {
	log('pick-up-stix | initHook');

	CONFIG.debug.hooks = true;

	// Assign custom classes and constants here

	// Register custom module settings
	registerSettings();

	// Preload Handlebars templates
	await preloadTemplates();

	Token.prototype.release = Token_tokenRelease(Token.prototype.release);

	if (game.system.id === 'dnd5e') {
		info(`pick-up-stix | initHook | System is '${game.system.id}' enabling Token.isVisible override.`);

		Object.defineProperty(Token.prototype, 'isVisible', {
			get: Token_isVisible,
			enumerable: true,
			configurable: true
		});
	}
};
