import { log, warn } from "../../log";

export function Token_tokenRelease(origFn: Function) {
	return function(options={}) {
		log(`pick-up-stix | tokenRelease | called with args`);
		log(options);
		origFn.call(this, options);
		if (canvas.hud?.pickUpStixLootHud?.object === this) {
			canvas.hud.pickUpStixLootHud.clear();
		}
		return true;
	}
}

export function Token_isVisible() {
	log(`pick-up-stix | Token_isVisible | called with args`);
	warn(`pick-up-stix | Token_isVisible | This method overrides isVisible of Token`);
	let actualIsVisible: boolean;
	const gm = game.user.isGM;
	if ( this.data.hidden ) {
		const tolerance = Math.min(this.w, this.h) / 4;

		// right now this is dnd5e only so this code is speicific to that
		const minPerceive = this.getFlag('pick-up-stix', 'pick-up-stix.minPerceiveValue');

		actualIsVisible =
			gm
			|| (canvas.sight.testVisibility(this.center, {tolerance}) && canvas.tokens.controlled.some(t => minPerceive === undefined || minPerceive == null || t.actor?.data?.data?.skills?.prc?.passive >= minPerceive));
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
