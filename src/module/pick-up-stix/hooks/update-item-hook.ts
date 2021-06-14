import { log } from "../../../log";
import { amIFirstGm } from "../../../utils";
import { ItemFlags } from "../loot-token";
import { getLootToken, updateToken } from "../main";
import { getCanvas } from "../settings";

export const updateItemHook = async (item, data, options, userId) => {
  log(`pick-up-stix | updateItemHook`);
  log([item, data, options, userId]);

  const itemFlags: ItemFlags = item.getFlag('pick-up-stix', 'pick-up-stix');
  log(`pick-up-stix | updateItemHook | itemFlags:`);
  log([itemFlags]);

  if (!amIFirstGm()) {
    log(`pick-up-stix | updateItemHook | User is not GM`);
    return;
  }

  const lootTokens = getLootToken({ itemId: item.id });
  const updates = [];
  for (let lt of lootTokens) {
    updates.push({
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
getCanvas().tokens.updateMany(updates);
}
