import { deleteOwnedItem, updateEmbeddedEntity, updateEntity } from "../main";

export const createOwnedItemHook = async (actor, item, options, userId) => {
  console.log(`pick-up-stix | createOwnedItemHook:`);
  console.log([actor, item, options, userId]);

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
