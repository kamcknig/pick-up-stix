import { log } from "../../../log";
import { deleteEmbeddedEntity, getLootToken } from "../main";

export const deleteItemHook = async (item, options, userId) => {
  log(`pick-up-stix | deleteItemHook:`);
  log([item, options, userId]);

  const lts = getLootToken({ uuid: item.uuid });

  for (let lootToken of lts) {
    await deleteEmbeddedEntity(Scene.collection.get(lootToken.sceneId).uuid, 'Token', lootToken.tokenId);
  }
};
