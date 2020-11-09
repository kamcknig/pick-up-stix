import { log } from "../../log";

export function tokenRelease(origFn: Function) {
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
