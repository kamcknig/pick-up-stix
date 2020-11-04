import { getLootToken, updateEmbeddedEntity } from "../main"

export const updateItemHook = async (item, data, options, userId) => {
  console.log(`pick-up-stix | updateItemHook`);
  console.log([item, data, options, userId]);

  const lootTokens = getLootToken({ uuid: item.uuid });
  for(let lt of lootTokens) {
    const uuid = Scene.collection.get(lt.sceneId).uuid;
    await updateEmbeddedEntity(uuid, 'Token', {
      _id: lt.tokenId,
      ...item.getFlag('pick-up-stix', 'pick-up-stix.tokenData') ?? { width: 1, height: 1}
    });
  }
}
