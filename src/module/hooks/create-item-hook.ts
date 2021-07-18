import { log } from '../../main';
import { ItemType } from "../models";

export async function createItemHook(item: Item, options: any, userId: string) {
	log(` createItemHook | called with args:`);
	log([item, options, userId]);

	// change the type back to 'container' so that our item config sheet works. When the item is created, we created it with
	// the 'backpack' type because we are forced to use an existing item type. but then after we make it just switch it back.
	if (item.getFlag('pick-up-stix', 'pick-up-stix.itemType') === ItemType.CONTAINER) {
		item.data.type = 'container';
	}
}
