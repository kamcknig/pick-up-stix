import { log } from '../../main';
import { LootToken, TokenFlags } from "../loot-token";
import {
	getLootToken,
	handleItemDropped,
	normalizeDropData
} from "../mainEntry";
import { getCanvas, PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME } from '../settings';

/**
 * Handler for the dropCanvasData Foundry hook. This is used
 * in Foundry 0.7.0 and above
 * @param canvas
 * @param dropData
 */
const dropCanvasHandler = async (canvas, dropData) => {
	log(` dropCanvasData | called with args:`);
	log(canvas, dropData);

	if (dropData.type === "Item") {
		handleItemDropped(await normalizeDropData(dropData));
	}
}

export const canvasReadyHook = async (canvas) => {
  log(` canvasReadyHook`);
  log([canvas]);
	for (let token of <Token[]>getCanvas().tokens?.placeables?.filter(p => p instanceof Token)) {
		const tokenFlags: TokenFlags = <TokenFlags>token.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);
		if (!tokenFlags?.itemId) {
			continue;
		}

		log(` canvasReadyHook | Found token '${token.id}' with for item '${tokenFlags.itemId}'`);

		let lootToken: LootToken = getLootToken({ itemId: tokenFlags.itemId, tokenId: token.id })?.[0];

		if (tokenFlags?.isLocked) {
			lootToken?.drawLock();
		}

		lootToken?.activateListeners();
	}

	Hooks.off('dropCanvasData', dropCanvasHandler);
	Hooks.on('dropCanvasData', dropCanvasHandler);
}
