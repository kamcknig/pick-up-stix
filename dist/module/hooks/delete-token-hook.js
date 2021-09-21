import { debug, log, warn } from "../../main.js";
import { amIFirstGm } from "../utils.js";
import { deleteItem, getLootToken, lootTokens } from "../mainEntry.js";
import { PICK_UP_STIX_ITEM_ID_FLAG, PICK_UP_STIX_MODULE_NAME } from "../settings.js";
export const deleteTokenHook = async (scene, tokenData, options, userId) => {
    log(` deleteTokenHook:`);
    log([scene, tokenData, options, userId]);
    const removed = (lootTokens.findSplice((lt) => lt.sceneId === scene.id && lt.tokenId === tokenData._id));
    if (!removed) {
        return;
    }
    removed.deactivateListeners();
    if (!amIFirstGm()) {
        log(` deleteTokenHook | User is not first GM`);
        return;
    }
    const itemId = getProperty(tokenData, 'flags.' + PICK_UP_STIX_MODULE_NAME + '.' + PICK_UP_STIX_ITEM_ID_FLAG);
    if (itemId && getLootToken({ itemId: removed?.itemId }).length === 0) {
        if (itemId) {
            log(` deleteTokenHook | No LootTokens left, deleting Item '${itemId}' for LootToken`);
            await deleteItem(itemId);
        }
        else {
            warn(` deleteTokenHook | Item ID not found on TokenFlags for token:`);
            debug([tokenData]);
        }
    }
};
