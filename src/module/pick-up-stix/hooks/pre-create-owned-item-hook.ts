import { deleteOwnedItem } from "../main";
import { ItemType } from "../models";

export async function preCreateOwnedItemHook(actor: Actor, itemData: any, options: any, userId: string) {
	if (itemData.type === ItemType.CONTAINER) {
		ui.notifications.error('Container items may not be owned.');
		return false;
	}

	const owner = getProperty(itemData, 'flags.pick-up-stix.pick-up-stix.owner');
  const ownerActor = game.actors.get(owner);
  if (ownerActor) {
    await deleteOwnedItem(ownerActor.id, itemData._id);
	}

	mergeObject(itemData, {
		flags: {
			'pick-up-stix': {
				'pick-up-stix': {
					originalItemId: getProperty(itemData, 'flags.pick-up-stix.pick-up-stix.originalItemId') ?? itemData._id
				}
			}
		}
	})
};
