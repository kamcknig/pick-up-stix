import { log } from "../../main.js";
import { createLootToken, getLootToken } from "../mainEntry.js";
import { getCanvas, PICK_UP_STIX_ITEM_ID_FLAG, PICK_UP_STIX_MODULE_NAME } from "../settings.js";
export const lootTokenCreatedHook = async (tokenId) => {
    log(` lootTokenCreatedHook:`);
    log([tokenId]);
    const token = getCanvas().tokens?.placeables.find((p) => p.id === tokenId);
    if (token) {
        const itemId = token.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_ITEM_ID_FLAG);
        let lootToken = getLootToken({ itemId: itemId, tokenId })?.[0];
        if (!lootToken) {
            log(` lootTokenCreatedHook | No LootToken instance found for created loot token`);
            lootToken = await createLootToken(tokenId, itemId, false);
        }
        lootToken?.activateListeners();
    }
};

//# sourceMappingURL=../../maps/module/hooks/loot-token-created-hook.js.map
