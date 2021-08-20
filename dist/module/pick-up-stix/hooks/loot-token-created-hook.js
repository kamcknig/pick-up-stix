import { log } from "../../../log.js";
import { createLootToken, getLootToken } from "../main.js";
import { getCanvas } from "../settings.js";
export const lootTokenCreatedHook = async (tokenId) => {
    log(`pick-up-stix | lootTokenCreatedHook:`);
    log([tokenId]);
    const token = getCanvas().tokens.placeables.find(p => p.id === tokenId);
    if (token) {
        const itemId = token.getFlag('pick-up-stix', 'pick-up-stix.itemId');
        let lootToken = getLootToken({ itemId: itemId, tokenId })?.[0];
        if (!lootToken) {
            log(`pick-up-stix | lootTokenCreatedHook | No LootToken instance found for created loot token`);
            lootToken = await createLootToken(tokenId, itemId, false);
        }
        lootToken?.activateListeners();
    }
};

//# sourceMappingURL=../../../maps/module/pick-up-stix/hooks/loot-token-created-hook.js.map
