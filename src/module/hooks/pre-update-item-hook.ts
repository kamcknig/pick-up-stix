import { log } from '../../main';
import { ItemFlags } from "../loot-token";
import { ItemType } from "../models";

export const preUpdateItemHook = async (item, data, options, userId) => {
  log(` preUpdateItemHook:`);
  log([item, data, options, userId]);

  const itemFlags: ItemFlags = item.getFlag('pick-up-stix', 'pick-up-stix');

  if (itemFlags?.itemType === ItemType.CONTAINER) {
    data.img = data?.flags?.['pick-up-stix']?.['pick-up-stix']?.container.imageClosePath ?? itemFlags.container.imageClosePath;
    setProperty(data, 'flags.pick-up-stix.pick-up-stix.tokenData.img', data.img);
  }
}
