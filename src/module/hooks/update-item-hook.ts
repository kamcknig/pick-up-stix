import { log } from '../../pick-up-stix-main';
import { amIFirstGm } from "../utils";
import { ItemFlags, LootToken } from "../loot-token";
import { getLootToken, updateToken } from "../mainEntry";
import { TokenData } from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/module.mjs';
import { getCanvas, getGame } from '../settings';
import { TokenBarDataProperties } from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/tokenBarData';
import { TokenDataProperties } from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/tokenData';

export const updateItemHook = async (item, data, options, userId) => {
  log(` updateItemHook`);
  log([item, data, options, userId]);

  const itemFlags: ItemFlags = item.getFlag('pick-up-stix', 'pick-up-stix');
  log(` updateItemHook | itemFlags:`);
  log([itemFlags]);

  if (!amIFirstGm()) {
    log(` updateItemHook | User is not GM`);
    return;
  }

  const lootTokens = <LootToken[]>getLootToken({ itemId: item.id });
 
  for (let lt of lootTokens) { 
    let updates:Record<string, unknown>[] = [];
    const update:Record<string, unknown> = 
    {
      id: <string>lt.tokenId,
      width: <number>itemFlags?.tokenData?.width ?? 1,
      height: <number>itemFlags?.tokenData?.height ?? 1,
      name: <string>item.data.name,
      img: itemFlags.container !== undefined
        ? (lt.isOpen
          ? <string>itemFlags.container.imageOpenPath
          : <string>itemFlags.container.imageClosePath
        )
        : <string>item.data.img
    };
    updates.push(update);
    let token = <Token>getCanvas().tokens?.get( lt.tokenId);
    token.document.updateEmbeddedDocuments(token.document.documentName, updates)
  }
  // getCanvas().tokens?.updateAll(updates);
}
