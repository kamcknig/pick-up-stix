import { log, warn } from '../../pick-up-stix-main';
import { amIFirstGm } from "../utils";
import { LootToken } from "../loot-token"
import { deleteItem, getLootToken, lootTokens } from "../mainEntry"
import { PICK_UP_STIX_ITEM_ID_FLAG, PICK_UP_STIX_MODULE_NAME } from '../settings';

export const deleteTokenHook = async (scene, tokenData, options, userId) => {
  log(` deleteTokenHook:`);
  log([scene, tokenData, options, userId]);

  const removed: LootToken = <LootToken>lootTokens.findSplice((lt: LootToken) => lt.sceneId === scene.id && lt.tokenId === tokenData._id);

  if (!removed) {
    return;
  }

  removed.deactivateListeners();

  if (!amIFirstGm()) {
    log(` deleteTokenHook | User is not first GM`);
    return;
  }

  const itemId = getProperty(tokenData, 'flags.'+PICK_UP_STIX_MODULE_NAME+'.'+PICK_UP_STIX_ITEM_ID_FLAG);

  if (itemId && getLootToken({ itemId: removed?.itemId }).length === 0) {
    if (itemId) {
      log(` deleteTokenHook | No LootTokens left, deleting Item '${itemId}' for LootToken`);
      await deleteItem(itemId);
    }
    else {
      warn(` deleteTokenHook | Item ID not found on TokenFlags for token:`);
      console.debug([tokenData]);
    }
  }
}
