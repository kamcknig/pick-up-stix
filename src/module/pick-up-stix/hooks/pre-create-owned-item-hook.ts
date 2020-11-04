import { deleteEntity, deleteOwnedItem } from "../main";
import { ItemType } from "../models";
import { deleteItemHook } from "./delete-item-hook";

export async function preCreateOwnedItemHook(actor: Actor, itemData: any, options: any, userId: string) {
	if (itemData.type === ItemType.CONTAINER) {
		ui.notifications.error('Container items may not be owned.');
		return false;
	}

	console.log(`pick-up-stix | onPreCreateOwnedItem | called with args:`);
	console.log([actor, duplicate(itemData), options, userId]);

	let owner: string = getProperty(itemData, 'flags.pick-up-stix.pick-up-stix.owner');
	if (owner) {
		// if the item is already owned by someone else, set the new actor as the owner and
		// delete the item from the old owner

		const ownerActor = game.actors.get(owner);
		await deleteOwnedItem(ownerActor.id, itemData._id);
	}

	setProperty(itemData, 'flags.pick-up-stix.pick-up-stix.owner', actor.id);

	console.log('pick-up-stix | onPreCreateOwnedItem | final itemData:');
	console.log(itemData);
};
