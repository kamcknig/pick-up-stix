import { log, warn } from "../../log";
import { canSeeLootToken } from "../../utils";
import { TokenFlags } from "./loot-token";

export function Token_tokenRelease(origFn: Function) {
	return function(options={}) {
		log(` tokenRelease | called with args`);
		log(options);
		origFn.call(this, options);
		if (canvas.hud?.pickUpStixLootHud?.object === this) {
			canvas.hud.pickUpStixLootHud.clear();
		}
		return true;
	}
}

export function Token_isVisible() {
	log(` Token_isVisible | called with args`);
	warn(` Token_isVisible | This method overrides isVisible of Token`);
	let actualIsVisible: boolean;
	if ( this.data.hidden ) {
		const tokenFlags: TokenFlags = this.getFlag('pick-up-stix', 'pick-up-stix');

		actualIsVisible = game.user.isGM || (tokenFlags && canSeeLootToken(this))
	}
	else if (!canvas.sight.tokenVision) {
		actualIsVisible = true;
	}
	else if ( this._controlled ) {
		actualIsVisible = true;
	}
	else {
		const tolerance = Math.min(this.w, this.h) / 4;
		actualIsVisible = canvas.sight.testVisibility(this.center, {tolerance});
	}

	return actualIsVisible
}
