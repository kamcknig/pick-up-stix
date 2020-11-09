import { log } from "../../../log";
import { LootToken, TokenFlags } from "../loot-token";
import {
	getLootToken,
	handleItemDropped,
	normalizeDropData
} from "../main";

/**
 * Handler for the dropCanvasData Foundry hook. This is used
 * in Foundry 0.7.0 and above
 * @param canvas
 * @param dropData
 */
const dropCanvasHandler = async (canvas, dropData) => {
	log(`pick-up-stix | dropCanvasData | called with args:`);
	log(canvas, dropData);

	if (dropData.type === "Item") {
		handleItemDropped(normalizeDropData(dropData));
	}
}

export const canvasReadyHook = async (canvas) => {
  log(`pick-up-stix | canvasReadyHook`);
  log([canvas]);

	for (let token of canvas.tokens.placeables?.filter(p => p instanceof Token)) {
		const tokenFlags: TokenFlags = token.getFlag('pick-up-stix', 'pick-up-stix');
		if (!tokenFlags?.itemUuid) {
			continue;
		}

		log(`pick-up-stix | canvasReadyHook | Found token '${token.id}' with for item '${tokenFlags.itemUuid}'`);

		let lootToken: LootToken = getLootToken({ uuid: tokenFlags.itemUuid, tokenId: token.id })?.[0];

		if (!lootToken) {
			log(`pick-up-stix | canvasReadyHook | Loot token not found for token '${token.id}' with for item '${tokenFlags.itemUuid}', creating new loot token`);
			lootToken = await LootToken.create(token.id, tokenFlags.itemUuid);
		}

		if (token.data.flags?.['pick-up-stix']?.['pick-up-stix']?.isLocked) {
			lootToken.drawLock();
		}

		lootToken.activateListeners();
	}

	Hooks.off('dropCanvasData', dropCanvasHandler);
	Hooks.on('dropCanvasData', dropCanvasHandler);
}
