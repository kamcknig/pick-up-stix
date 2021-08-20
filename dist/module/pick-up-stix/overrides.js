import { log, warn } from "../../log.js";
import { canSeeLootToken } from "../../utils.js";
import { getCanvas } from "./settings.js";
export function Token_tokenRelease(origFn) {
    return function (options = {}) {
        log(`pick-up-stix | tokenRelease | called with args`);
        log(options);
        origFn.call(this, options);
        //@ts-ignore
        if (getCanvas().hud?.pickUpStixLootHud?.object === this) {
            //@ts-ignore
            getCanvas().hud.pickUpStixLootHud.clear();
        }
        return true;
    };
}
export function Token_isVisible() {
    log(`pick-up-stix | Token_isVisible | called with args`);
    warn(`pick-up-stix | Token_isVisible | This method overrides isVisible of Token`);
    let actualIsVisible;
    if (this.data.hidden) {
        const tokenFlags = this.getFlag('pick-up-stix', 'pick-up-stix');
        actualIsVisible = game.user.isGM || (tokenFlags && canSeeLootToken(this));
    }
    else if (!getCanvas().sight.tokenVision) {
        actualIsVisible = true;
    }
    else if (this._controlled) {
        actualIsVisible = true;
    }
    else {
        const tolerance = Math.min(this.w, this.h) / 4;
        actualIsVisible = getCanvas().sight.testVisibility(this.center, { tolerance });
    }
    return actualIsVisible;
}

//# sourceMappingURL=../../maps/module/pick-up-stix/overrides.js.map
