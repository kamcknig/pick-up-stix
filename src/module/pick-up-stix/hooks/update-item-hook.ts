import { log } from "../../../log";
import { ItemFlags } from "../loot-token";
import { getLootToken, updateEmbeddedEntity } from "../main";

export const updateItemHook = async (item, data, options, userId) => {
  log(`pick-up-stix | updateItemHook`);
  log([item, data, options, userId]);

  const itemFlags: ItemFlags = item.getFlag('pick-up-stix', 'pick-up-stix');
  log(`pick-up-stix | updateItemHook | itemFlags:`);
  log([itemFlags]);

  const lootTokens = getLootToken({ uuid: item.uuid });
  for(let lt of lootTokens) {
    const scene = Scene.collection.get(lt.sceneId);
    const sceneUuid = scene.uuid;
    await updateEmbeddedEntity(sceneUuid, 'Token', {
      _id: lt.tokenId,
      width: itemFlags?.tokenData?.width ?? 1,
      height: itemFlags?.tokenData?.height ?? 1,
      name: item.data.name,
      img: itemFlags.container !== undefined
        ? (lt.isOpen
          ? itemFlags.container.imageOpenPath
          : itemFlags.container.imageClosePath
        )
        : item.data.img
    });
  }
}
