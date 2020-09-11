export async function onPreCreateOwnedItem(actor: Actor, itemData: any, options: any, userId: string) {
	console.log(`pick-up-stix | onPreCreateOwnedItem | called with args:`);
	console.log([actor, duplicate(itemData), options, userId]);

	let owner: string = getProperty(itemData, 'flags.pick-up-stix.pick-up-stix.owner');
	if (owner) {
		// if the item is already owned by someone else, set the new actor as the owner and
		// delete the item from the old owner
		setProperty(itemData, 'flags.pick-up-stix.pick-up-stix.owner', actor.id);
		const ownerActor = game.actors.get(owner);
		await ownerActor.deleteOwnedItem(itemData._id);
	}

	setProperty(itemData, 'flags.pick-up-stix.pick-up-stix.itemId', itemData._id);
	setProperty(itemData, 'flags.pick-up-stix.pick-up-stix.owner', actor.id);

	console.log('pick-up-stix | onPreCreateOwnedItem | final itemData:');
	console.log(itemData);
};
