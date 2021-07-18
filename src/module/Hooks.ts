//@ts-ignore
import { DND5E } from "../../../systems/dnd5e/module/config.js";
import { log, warn } from "../main.js";
import { PICK_UP_STIX_MODULE_NAME } from "./settings.js";

export let readyHooks = async () => {

  
}

export const setupHooks = async () => {

  // setup all the hooks


}

export const initHooks = async () => {
  warn("Init Hooks processing");
  log('initHook');

	CONFIG.debug.hooks = true;
	CONFIG.debug['pickUpStix'] = true;

	// Assign custom classes and constants here

	// Register custom module settings
	//registerSettings();

	// Preload Handlebars templates
	//await preloadTemplates();

  //@ts-ignore
  libWrapper.register(PICK_UP_STIX_MODULE_NAME,"Token.prototype.release", TokenPrototypeReleaseHandler, "MIXED");

	// Token.prototype.release = Token_tokenRelease(Token.prototype.release);

	// if (game.system.id === 'dnd5e') {
	// 	log(` initHook | System is '${game.system.id}' enabling Token.isVisible override.`);

	// 	Object.defineProperty(Token.prototype, 'isVisible', {
	// 		get: Token_isVisible,
	// 		enumerable: true,
	// 		configurable: true
	// 	});
	// }
}


export const TokenPrototypeReleaseHandler = function (wrapped, ...args) {

	if (game.system.id === 'dnd5e') {
		log(` initHook | System is '${game.system.id}' enabling Token.isVisible override.`);

		Object.defineProperty(Token.prototype, 'isVisible', {
			get: Token_isVisible,
			enumerable: true,
			configurable: true
		});
  }
}