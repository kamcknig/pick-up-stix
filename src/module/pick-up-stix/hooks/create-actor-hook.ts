export async function onCreateActor(actor: Actor, userId: string) {
	console.log(`pick-up-stix | onCreateActor | called with args:`);
	console.log([actor, userId]);
	const updates = [
		...Object.values(actor.items.entries).map(ownedItem => ({
			_id: ownedItem.id,
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						initialState: {
							count: 1,
							itemData: {
								...ownedItem.data
							}
						}
					}
				}
			}
		}))
	];
	console.log(updates);
	await actor.updateOwnedItem(updates)
}
