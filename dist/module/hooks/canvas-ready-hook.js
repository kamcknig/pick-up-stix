import { log } from "../../main.js";
import { getLootToken, handleItemDropped, normalizeDropData } from "../mainEntry.js";
import { getCanvas, PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME } from "../settings.js";
/**
 * This function is called when something is dropped onto the canvas. If the
 * item dropped onto the canvas is a folder, it is handled here. Otherwise,
 * the original wrapper function is used.
 *
 * @param {fn} wrapper - The original onDrop function
 * @param  {...any} args - Any arguments provided with the original onDrop function
 */
export const CanvasPrototypeOnDropHandler = function (wrapper, ...args) {
    try {
        const [event] = args;
        // Get data from event
        const data = JSON.parse(event.dataTransfer.getData('text/plain'));
        dropCanvasHandler(getCanvas(), data);
        return wrapper(...args);
    }
    catch (error) {
        return wrapper(...args);
    }
};
/**
 * Handler for the dropCanvasData Foundry hook. This is used
 * in Foundry 0.7.0 and above
 * @param canvas
 * @param dropData
 */
const dropCanvasHandler = async (canvas, dropData) => {
    log(` dropCanvasData | called with args:`);
    log(canvas, dropData);
    if (dropData.type === 'Item') {
        handleItemDropped(await normalizeDropData(dropData));
    }
};
export const canvasReadyHook = async (canvas) => {
    log(` canvasReadyHook`);
    log([canvas]);
    for (let token of getCanvas().tokens?.placeables?.filter((p) => p instanceof Token)) {
        const tokenFlags = token.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);
        if (!tokenFlags?.itemId) {
            continue;
        }
        log(` canvasReadyHook | Found token '${token.id}' with for item '${tokenFlags.itemId}'`);
        let lootToken = getLootToken({ itemId: tokenFlags.itemId, tokenId: token.id })?.[0];
        if (tokenFlags?.isLocked) {
            lootToken?.drawLock();
        }
        lootToken?.activateListeners();
    }
    //Hooks.off('dropCanvasData', dropCanvasHandler);
    //Hooks.on('dropCanvasData', dropCanvasHandler);
};
