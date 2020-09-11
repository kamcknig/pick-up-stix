import { ItemType } from "../models";

export async function onCreateItem(item: Item, options: any, userId: string) {
	console.log(`pick-up-stix | onCreateItem | called with args:`);
	console.log([item, options, userId]);

	// change the type back to 'container' so that our item config sheet works. When the item is created, we created it with
	// the 'backpack' type because we are forced to use an existing item type. but then after we make it just switch it back.
	if (getProperty(item, 'data.flags.pick-up-stix.pick-up-stix.itemType') === ItemType.CONTAINER) {
		item.data.type = 'container';
	}
}
