import { log } from "../../main.js";
import { amIFirstGm } from "../utils.js";
import { updateOwnedItem } from "../mainEntry.js";
export const createActorHook = async (actor, userId) => {
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
};

//# sourceMappingURL=../../maps/module/hooks/create-actor-hook.js.map
