import { log, warn } from "../../../log";
import { LootToken } from "../loot-token"
import { deleteItem, getLootToken, lootTokens } from "../main"

export const deleteTokenHook = async (scene, tokenData, options, userId) => {
  log(`pick-up-stix | deleteTokenHook:`);
  log([scene, tokenData, options, userId]);

  const removed: LootToken = lootTokens.findSplice((lt: LootToken) => lt.sceneId === scene.id && lt.tokenId === tokenData._id);

  if (!removed) {
    return;
  }

  removed.deactivateListeners();

  const uuid = getProperty(tokenData, 'flags.pick-up-stix.pick-up-stix.itemUuid');

  if (uuid && getLootToken({ uuid: removed?.itemUuid }).length === 0) {
    if (uuid) {
      log(`pick-up-stix | deleteTokenHook | No LootTokens left, deleting Item '${uuid}' for LootToken`);
      await deleteItem(uuid);
    }
    else {
      warn(`pick-up-stix | deleteTokenHook | No uuid not found on TokenFlags for token:`);
      console.debug([tokenData]);
    }
  }
}
