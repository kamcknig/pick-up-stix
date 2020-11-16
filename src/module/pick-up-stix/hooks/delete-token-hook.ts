import { log, warn } from "../../../log";
import { amIFirstGm } from "../../../utils";
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
}
