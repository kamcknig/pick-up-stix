import { error, log } from "../../../log";
import { collidedTokens } from "../../../utils";
import { TokenFlags } from "../loot-token";
import { getLootToken, handleItemDropped } from "../main";

export const updateTokenHook = async (scene, tokenData, updates, userId) => {
  log(`pick-up-stix | updateTokenHook:`);
  log([scene, tokenData, updates, userId]);

  if (tokenData.y === undefined && tokenData.x === undefined) {
    return;
  }

  const tokens = collidedTokens({ x: tokenData._x, y: tokenData._y });
  if (tokens.length > 1) {
    error(`pick-up-stix | updateTokenHook | Dropping onto multiple targets. preUpdateToken hook should have caught this and notified an error on the UI. This error is benigh though.`);
    return;
  }

  const lt = getLootToken({ sceneId: scene.id, tokenId: tokenData._id })?.[0];

  if (!lt) {
    error(`pick-up-stix | updateTokenHook | not LootToken found for token '${tokenData._id}' in scene '${scene.id}'`);
    return;
  }

  const tokenFlags: TokenFlags = getProperty(tokenData, 'flags.pick-up-stix.pick-up-stix');
  const item = await fromUuid(tokenFlags.itemUuid);

  handleItemDropped({ x: tokenData._x, y: tokenData._y, type: item.data.type, id: item.id });
}