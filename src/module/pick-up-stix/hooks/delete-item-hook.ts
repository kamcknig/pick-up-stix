import { log } from "../../../log";
import { deleteToken, getLootToken } from "../main";

export const deleteItemHook = async (item, options, userId) => {
  log(`pick-up-stix | deleteItemHook:`);
  log([item, options, userId]);

  if (!game.user.isGM) {
    log(`pick-up-stix | deleteItemHook | User is not first GM`);
    return;
  }

  const lts = getLootToken({ itemId: item.id });

  for (let lootToken of lts) {
    await deleteToken(lootToken.sceneId, lootToken.tokenId);
  }
};
