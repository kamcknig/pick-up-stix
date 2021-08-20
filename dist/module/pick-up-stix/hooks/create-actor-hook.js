import { log } from "../../../log.js";
import { amIFirstGm } from "../../../utils.js";
import { updateOwnedItem } from "../main.js";
export const createActorHook = async (actor, userId) => {
    log(`pick-up-stix | createActorHook | called with args:`);
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
        log(`pick-up-stix | createActorHook | User is not first GM`);
        return;
    }
    await updateOwnedItem(actor.id, updates);
};

//# sourceMappingURL=../../../maps/module/pick-up-stix/hooks/create-actor-hook.js.map
