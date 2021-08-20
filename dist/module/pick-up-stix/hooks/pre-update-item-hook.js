import { log } from "../../../log.js";
import { ItemType } from "../models.js";
export const preUpdateItemHook = async (item, data, options, userId) => {
    log(`pick-up-stix | preUpdateItemHook:`);
    log([item, data, options, userId]);
    const itemFlags = item.getFlag('pick-up-stix', 'pick-up-stix');
    if (itemFlags?.itemType === ItemType.CONTAINER) {
        data.img = data?.flags?.['pick-up-stix']?.['pick-up-stix']?.container.imageClosePath ?? itemFlags.container.imageClosePath;
        setProperty(data, 'flags.pick-up-stix.pick-up-stix.tokenData.img', data.img);
    }
};

//# sourceMappingURL=../../../maps/module/pick-up-stix/hooks/pre-update-item-hook.js.map
