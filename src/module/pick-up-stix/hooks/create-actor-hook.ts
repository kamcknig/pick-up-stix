import { log } from "../../../log";

export async function onCreateActor(actor: Actor, userId: string) {
	log(`pick-up-stix | onCreateActor | called with args:`);
	log([actor, userId]);
	const updates = [
		...Object.values(actor.items.entries).map(ownedItem => ({
			_id: ownedItem.id,
			flags: {
				'pick-up-stix': {
					'pick-up-stix': {
						owner: actor.id
					}
				}
			}
		}))
	];
	log(updates);
	await actor.updateOwnedItem(updates)
}
