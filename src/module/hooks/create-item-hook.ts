import { log } from '../../main';
import { ItemFlags } from '../loot-token';
import { ItemType } from '../models';
import { PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME } from '../settings';

export async function createItemHook(item: Item, options: any, userId: string) {
  log(` createItemHook | called with args:`);
  log([item, options, userId]);

  // change the type back to 'container' so that our item config sheet works. When the item is created, we created it with
  // the 'backpack' type because we are forced to use an existing item type. but then after we make it just switch it back.
  if ((<ItemFlags>item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG)).itemType === ItemType.CONTAINER) {
    item.data.type = 'container';
  }
}
