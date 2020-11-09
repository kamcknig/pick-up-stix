import { log } from "../../../log";
import { updateEmbeddedEntity } from "../main";

export const createOwnedItemHook = async (actor, item, options, userId) => {
  log(`pick-up-stix | createOwnedItemHook:`);
  log([actor, item, options, userId]);

  await updateEmbeddedEntity(actor.uuid, 'OwnedItem', {
    _id: item._id,
    flags: {
      'pick-up-stix': {
        'pick-up-stix': {
          owner: actor.id
        }
      }
    }
  });
}
