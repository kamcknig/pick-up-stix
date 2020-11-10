import { log } from "../../../log";
import { ItemFlags } from "../loot-token";
import { getLootToken, updateToken } from "../main";

export const updateItemHook = async (item, data, options, userId) => {
  log(`pick-up-stix | updateItemHook`);
  log([item, data, options, userId]);

  const itemFlags: ItemFlags = item.getFlag('pick-up-stix', 'pick-up-stix');
  log(`pick-up-stix | updateItemHook | itemFlags:`);
  log([itemFlags]);

  if (!game.user.isGM) {
    log(`pick-up-stix | updateItemHook | User is not GM`);
    return;
  }

  const lootTokens = getLootToken({ itemId: item.id });
  for(let lt of lootTokens) {
    const scene = Scene.collection.get(lt.sceneId);
    const sceneId = scene.id;
    await updateToken(sceneId, {
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
