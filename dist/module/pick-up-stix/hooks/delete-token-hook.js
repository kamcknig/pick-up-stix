import { log, warn } from "../../../log.js";
import { amIFirstGm } from "../../../utils.js";
import { deleteItem, getLootToken, lootTokens } from "../main.js";
export const deleteTokenHook = async (scene, tokenData, options, userId) => {
    log(`pick-up-stix | deleteTokenHook:`);
    log([scene, tokenData, options, userId]);
    const removed = lootTokens.findSplice((lt) => lt.sceneId === scene.id && lt.tokenId === tokenData._id);
    if (!removed) {
        return;
    }
    removed.deactivateListeners();
    if (!amIFirstGm()) {
        log(`pick-up-stix | deleteTokenHook | User is not first GM`);
        return;
    }
    const itemId = getProperty(tokenData, 'flags.pick-up-stix.pick-up-stix.itemId');
    if (itemId && getLootToken({ itemId: removed?.itemId }).length === 0) {
        if (itemId) {
            log(`pick-up-stix | deleteTokenHook | No LootTokens left, deleting Item '${itemId}' for LootToken`);
            await deleteItem(itemId);
        }
        else {
            warn(`pick-up-stix | deleteTokenHook | Item ID not found on TokenFlags for token:`);
            console.debug([tokenData]);
        }
    }
};

//# sourceMappingURL=../../../maps/module/pick-up-stix/hooks/delete-token-hook.js.map
