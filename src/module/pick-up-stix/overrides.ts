export function tokenRelease(origFn: Function) {
	return function(options={}) {
		console.log(`pick-up-stix | tokenRelease | called with args`);
		console.log(options);
		origFn.call(this, options);
		if (canvas.hud.pickUpStixLootHud.object === this) {
			canvas.hud.pickUpStixLootHud.clear();
		}
		return true;
	}
}
