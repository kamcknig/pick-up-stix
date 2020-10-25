export async function preCreateOwnedItemHook(actor: Actor, itemData: any, options: any, userId: string) {
	console.log(`pick-up-stix | onPreCreateOwnedItem | called with args:`);
	console.log([actor, duplicate(itemData), options, userId]);

	let owner: string = getProperty(itemData, 'flags.pick-up-stix.pick-up-stix.owner');
	if (owner) {
		// if the item is already owned by someone else, set the new actor as the owner and
		// delete the item from the old owner

		// TODO: will this work if the token/actor is unlinked?
		setProperty(itemData, 'flags.pick-up-stix.pick-up-stix.owner', actor.id);
		const ownerActor = game.actors.get(owner);
		await ownerActor.deleteOwnedItem(itemData._id);
	}

	setProperty(itemData, 'flags.pick-up-stix.pick-up-stix.owner', actor.id);
	setProperty(itemData, 'flags.pick-up-stix.pick-up-stix.originalItemId', itemData._id);

	console.log('pick-up-stix | onPreCreateOwnedItem | final itemData:');
	console.log(itemData);
};
