import { log } from "../../../log.js";
import { amIFirstGm } from "../../../utils.js";
import { deleteToken, getLootToken } from "../main.js";
export const deleteItemHook = async (item, options, userId) => {
    log(`pick-up-stix | deleteItemHook:`);
    log([item, options, userId]);
    if (!amIFirstGm()) {
        log(`pick-up-stix | deleteItemHook | User is not first GM`);
        return;
    }
    const lts = getLootToken({ itemId: item.id });
    for (let lootToken of lts) {
        await deleteToken(lootToken.tokenId, lootToken.sceneId);
    }
};

//# sourceMappingURL=../../../maps/module/pick-up-stix/hooks/delete-item-hook.js.map
