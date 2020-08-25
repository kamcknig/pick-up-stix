import { handleDropItem } from "./main";

/**
 * TODO remove once .0.7.x becomes a stable release
 * This method overrides the normal DragDrop 'drop' operation for the Canvas object.
 *
 * @override
 * @param event
 */
export async function handleOnDrop(event) {
	console.log(`pick-up-stix | handleOnDrop | called with args:`);
	console.log(event);
	event.preventDefault();

	// canvas._onDrop(event);

	// Try to extract the data
	let data;
	try {
		data = JSON.parse(event.dataTransfer.getData('text/plain'));
		console.log(`pick-up-stix | handleOnDrop | data from event:`);
		console.log(data);
	}
	catch (err) {
		return false;
	}

	// Acquire the cursor position transformed to Canvas coordinates
	const [x, y] = [event.clientX, event.clientY];
	const t = this.stage.worldTransform;
	data.x = (x - t.tx) / canvas.stage.scale.x;
	data.y = (y - t.ty) / canvas.stage.scale.y;

	if (data.type === "Item") {
		handleDropItem(data);
	}
}

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
