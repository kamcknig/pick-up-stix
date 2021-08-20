import { log } from "../../../log.js";
import { getLootToken, handleItemDropped, normalizeDropData } from "../main.js";
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
        handleItemDropped(await normalizeDropData(dropData));
    }
};
export const canvasReadyHook = async (canvas) => {
    log(`pick-up-stix | canvasReadyHook`);
    log([canvas]);
    for (let token of canvas.tokens.placeables?.filter(p => p instanceof Token)) {
        const tokenFlags = token.getFlag('pick-up-stix', 'pick-up-stix');
        if (!tokenFlags?.itemId) {
            continue;
        }
        log(`pick-up-stix | canvasReadyHook | Found token '${token.id}' with for item '${tokenFlags.itemId}'`);
        let lootToken = getLootToken({ itemId: tokenFlags.itemId, tokenId: token.id })?.[0];
        if (token.data.flags?.['pick-up-stix']?.['pick-up-stix']?.isLocked) {
            lootToken?.drawLock();
        }
        lootToken?.activateListeners();
    }
    Hooks.off('dropCanvasData', dropCanvasHandler);
    Hooks.on('dropCanvasData', dropCanvasHandler);
};

//# sourceMappingURL=../../../maps/module/pick-up-stix/hooks/canvas-ready-hook.js.map
