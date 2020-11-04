import { LootToken } from "../loot-token"
import { deleteEntity, getLootToken, lootTokens } from "../main"

export const deleteTokenHook = async (scene, tokenData, options, userId) => {
  console.log(`pick-up-stix | deleteTokenHook:`);
  console.log([scene, tokenData, options, userId]);

  const removed: LootToken = lootTokens.findSplice((lt: LootToken) => lt.sceneId === scene.id && lt.tokenId === tokenData._id);
  removed?.deactivateListeners();

  if (getLootToken({ uuid: removed.itemUuid }).length === 0) {
    const uuid = getProperty(tokenData, 'flags.pick-up-stix.pick-up-stix.itemUuid');
    if (uuid) {
      console.log(`pick-up-stix | deleteTokenHook | No LootTokens left, deleting Item '${uuid}' for LootToken`);
      await deleteEntity(uuid);
    }
    else {
      console.warn(`pick-up-stix | deleteTokenHook | No uuid not found on TokenFlags for token:`);
      console.debug([tokenData]);
    }
  }
}
