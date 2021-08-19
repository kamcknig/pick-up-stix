import { log } from "../../main.js";
import { ItemType } from "../models.js";
import { PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME } from "../settings.js";
export const preUpdateItemHook = async (item, data, options, userId) => {
    log(` preUpdateItemHook:`);
    log([item, data, options, userId]);
    const itemFlags = item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG);
    if (itemFlags?.itemType === ItemType.CONTAINER) {
        data.img =
            data?.flags?.[PICK_UP_STIX_MODULE_NAME]?.[PICK_UP_STIX_FLAG]?.container.imageClosePath ??
                itemFlags.container?.imageClosePath;
        setProperty(data, 'flags.pick-up-stix.pick-up-stix.tokenData.img', data.img);
    }
};

//# sourceMappingURL=../../maps/module/hooks/pre-update-item-hook.js.map
