/* ------------------------------------ */
/* Initialize module					*/
import { registerSettings } from "../settings.js";
import { preloadTemplates } from "../preloadTemplates.js";
import { Token_isVisible, Token_tokenRelease } from "../overrides.js";
import { info, log } from "../../../log.js";
/* ------------------------------------ */
export async function initHook() {
    log('pick-up-stix | initHook');
    // CONFIG.debug.hooks = true;
    // CONFIG.debug['pickUpStix'] = true;
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
}
;

//# sourceMappingURL=../../../maps/module/pick-up-stix/hooks/init-hook.js.map
