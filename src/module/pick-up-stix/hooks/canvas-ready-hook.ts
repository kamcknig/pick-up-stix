import { handleDropItem, setupMouseManager, drawLockIcon } from "../main";
import { PickUpStixFlags } from "../models";
import { handleOnDrop } from "../overrides";
import { LootHud } from "../loot-hud-application";

let boardDropListener;
const dropCanvasHandler = async (canvas, dropData) => {
	console.log(`pick-up-stix | dropCanvasData | called with args:`);
	console.log(canvas, dropData);

	if (dropData.type === "Item") {
		handleDropItem(dropData);
	}
}

export async function onCanvasReady(...args) {
	console.log(`pick-up-stix | onCanvasReady | call width args:`);
	console.log(args);
	console.log(game.user);

  canvas?.tokens?.placeables?.forEach(async (p: PlaceableObject) => {
		const flags: PickUpStixFlags = p.getFlag('pick-up-stix', 'pick-up-stix');

		if (flags) {
			console.log(`pick-up-stix | onCanvasReady | found token ${p.id} with itemData`);
			p.mouseInteractionManager = setupMouseManager.bind(p)();

			if (flags.isLocked) {
				console.log(`pick-up-stix | onCanvasReady | loot is locked, draw lock icon`);
				await drawLockIcon(p);
			}
		}
  });

	const coreVersion: string = game.data.version;
	if (isNewerVersion(coreVersion, '0.6.9')) {
    console.log(`pick-up-stix | onCanvasReady | Foundry version newer than 0.6.9. Using dropCanvasData hook`);

		Hooks.off('dropCanvasData', dropCanvasHandler);
		Hooks.on('dropCanvasData', dropCanvasHandler);
	}
	else {
		console.log(`pick-up-stix | onCanvasReady | Foundry version is 0.6.9 or below. Overriding Canvas._onDrop`);

		const board = document.getElementById('board');
		if (boardDropListener) {
			board.removeEventListener('drop', boardDropListener);
		}

		boardDropListener = handleOnDrop.bind(canvas);
		board.addEventListener('drop', boardDropListener);
	}

	canvas.hud.pickUpStixLootHud = new LootHud();
}
