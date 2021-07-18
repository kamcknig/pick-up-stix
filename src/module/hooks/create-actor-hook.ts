import { log } from '../../main';
import { amIFirstGm } from "../../../utils";
import { updateOwnedItem } from "../mainEntry";

export const createActorHook = async (actor: Actor, userId: string) => {
	log(` createActorHook | called with args:`);
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

	if (!amIFirstGm()) {
		log(` createActorHook | User is not first GM`);
		return;
  }

	await updateOwnedItem(actor.id, updates);
}
