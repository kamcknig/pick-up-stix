import { deleteEmbeddedEntity, getLootToken } from "../main";

export const deleteItemHook = async (item, options, userId) => {
  console.log(`pick-up-stix | deleteItemHook:`);
  console.log([item, options, userId]);

  const lts = getLootToken({ uuid: item.uuid });

  for (let lootToken of lts) {
    await deleteEmbeddedEntity(Scene.collection.get(lootToken.sceneId).uuid, 'Token', lootToken.tokenId);
  }
};
