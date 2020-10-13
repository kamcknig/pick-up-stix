import { lootTokens } from "../main"

export const deleteTokenHook = (scene, tokenData, options, userId) => {
  lootTokens.findSplice(lt => lt.sceneId === scene.id && lt.tokenId === tokenData._id);
}
