import { ItemFlags, TokenData } from "../loot-token";
import { getLootToken, updateEmbeddedEntity } from "../main";

export const updateItemHook = async (item, data, options, userId) => {
  console.log(`pick-up-stix | updateItemHook`);
  console.log([item, data, options, userId]);

  const itemFlags: ItemFlags = item.getFlag('pick-up-stix', 'pick-up-stix');
  console.log(`pick-up-stix | updateItemHook | itemFlags:`);
  console.log([itemFlags]);

  const lootTokens = getLootToken({ uuid: item.uuid });
  for(let lt of lootTokens) {
    const scene = Scene.collection.get(lt.sceneId);
    const sceneUuid = scene.uuid;
    await updateEmbeddedEntity(sceneUuid, 'Token', {
      _id: lt.tokenId,
      width: 1,
      height: 1,
      name: item.data.name,
      img: lt.isOpen ? itemFlags.container.imageOpenPath : itemFlags.container.imageClosePath
    });
  }
}
