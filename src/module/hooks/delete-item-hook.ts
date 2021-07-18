import { log } from "../../../log";
import { amIFirstGm } from "../../../utils";
import { deleteToken, getLootToken } from "../main";

export const deleteItemHook = async (item, options, userId) => {
  log(` deleteItemHook:`);
  log([item, options, userId]);

  if (!amIFirstGm()) {
    log(` deleteItemHook | User is not first GM`);
    return;
  }

  const lts = getLootToken({ itemId: item.id });

  for (let lootToken of lts) {
    await deleteToken(lootToken.tokenId, lootToken.sceneId);
  }
};
