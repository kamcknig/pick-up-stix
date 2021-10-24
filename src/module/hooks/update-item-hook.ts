import { log } from '../../main';
import { amIFirstGm } from '../utils';
import { ItemFlags, LootToken } from '../loot-token';
import { getLootToken, updateToken } from '../mainEntry';
import { getCanvas, getGame, PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME } from '../settings';

export const updateItemHook = async (item, data, options, userId) => {
  log(` updateItemHook`);
  log([item, data, options, userId]);

  const itemFlags: ItemFlags = item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);
  log(` updateItemHook | itemFlags:`);
  log([itemFlags]);

  if (!amIFirstGm()) {
    log(` updateItemHook | User is not GM`);
    return;
  }

  const lootTokens = <LootToken[]>getLootToken({ itemId: item.id });

  for (const lt of lootTokens) {
    const updates: Record<string, unknown>[] = [];
    const update: Record<string, unknown> = {
      id: <string>lt.tokenId,
      width: <number>itemFlags?.tokenData?.width ?? 1,
      height: <number>itemFlags?.tokenData?.height ?? 1,
      name: <string>item.data.name,
      img:
        itemFlags.container !== undefined
          ? lt.isOpen
            ? <string>itemFlags.container.imageOpenPath
            : <string>itemFlags.container.imageClosePath
          : <string>item.data.img,
    };
    updates.push(update);
    const token = <Token>getCanvas().tokens?.get(lt.tokenId);
    token.document.updateEmbeddedDocuments(token.document.documentName, updates);
  }
  // getCanvas().tokens?.updateAll(updates);
};
