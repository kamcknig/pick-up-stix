import { log } from "../../../log";
import { createLootToken, getLootToken } from "../main";
import { getCanvas } from "../settings";

export const lootTokenCreatedHook = async (tokenId) => {
  log(`pick-up-stix | lootTokenCreatedHook:`);
  log([tokenId]);

  const token: Token = getCanvas().tokens.placeables.find(p => p.id === tokenId);

  if (token) {
    const itemId = <string>token.getFlag('pick-up-stix', 'pick-up-stix.itemId');
    let lootToken = getLootToken({ itemId: itemId, tokenId })?.[0];

    if (!lootToken) {
      log(`pick-up-stix | lootTokenCreatedHook | No LootToken instance found for created loot token`);
      lootToken = await createLootToken(tokenId, itemId, false);
    }

    lootToken?.activateListeners();
  }
}
