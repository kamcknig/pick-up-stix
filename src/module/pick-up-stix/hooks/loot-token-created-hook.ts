import { LootToken } from "../loot-token";
import { getLootToken } from "../main";

export const lootTokenCreatedHook = async (tokenId) => {
  console.log(`pick-up-stix | lootTokenCreatedHook:`);
  console.log([tokenId]);

  const token: Token = canvas.tokens.placeables.find(p => p.id === tokenId);

  if (token) {
    const itemUuid = token.getFlag('pick-up-stix', 'pick-up-stix.itemUuid');
    let lootToken = getLootToken({ uuid: itemUuid, tokenId })?.[0];

    if (!lootToken) {
      lootToken = await LootToken.create(tokenId, itemUuid);
    }

    lootToken?.activateListeners();
  }
}
