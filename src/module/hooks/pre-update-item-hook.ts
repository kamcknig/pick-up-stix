import { log } from '../../main';
import { ItemFlags } from '../loot-token';
import { ItemType } from '../models';
import { PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME } from '../settings';

export const preUpdateItemHook = async (item:Item, data, options, userId) => {
  log(` preUpdateItemHook:`);
  log([item, data, options, userId]);

  const itemFlags: ItemFlags = item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);

  if (itemFlags?.itemType === ItemType.CONTAINER) {
    data.img =
      data?.flags?.[PICK_UP_STIX_MODULE_NAME]?.[PICK_UP_STIX_FLAG]?.container.imageClosePath ??
      itemFlags.container?.imageClosePath;
    setProperty(data, 'flags.pick-up-stix.pick-up-stix.tokenData.img', data.img);
  }
};
