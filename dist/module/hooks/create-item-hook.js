import { log } from "../../main.js";
import { ItemType } from "../models.js";
import { PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME } from "../settings.js";
export async function createItemHook(item, options, userId) {
    log(` createItemHook | called with args:`);
    log([item, options, userId]);
    // change the type back to 'container' so that our item config sheet works. When the item is created, we created it with
    // the 'backpack' type because we are forced to use an existing item type. but then after we make it just switch it back.
    if (item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG).itemType === ItemType.CONTAINER) {
        item.data.type = 'container';
    }
}

//# sourceMappingURL=../../maps/module/hooks/create-item-hook.js.map
