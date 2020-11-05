import { ItemFlags, TokenData } from "../loot-token";
import { getLootToken, updateEmbeddedEntity } from "../main";
import { ItemType } from "../models";

export const updateItemHook = async (item, data, options, userId) => {
  console.log(`pick-up-stix | updateItemHook`);
  console.log([item, data, options, userId]);

  const lootTokens = getLootToken({ uuid: item.uuid });
  for(let lt of lootTokens) {
    const scene = Scene.collection.get(lt.sceneId);
    const sceneUuid = scene.uuid;
    const itemFlags: ItemFlags = item.getFlag('pick-up-stix', 'pick-up-stix');
    const tokenData: TokenData = itemFlags?.tokenData;
    await updateEmbeddedEntity(sceneUuid, 'Token', {
      _id: lt.tokenId,
      width: 1,
      height: 1,
      name: item.data.name,
      ...tokenData ?? {},
      img:
        itemFlags.itemType === ItemType.ITEM
          ? item.data.img
          : (
            lt.isOpen
              ? itemFlags.container.imageOpenPath
              : itemFlags.container.imageClosePath
          )
    });
  }
}
