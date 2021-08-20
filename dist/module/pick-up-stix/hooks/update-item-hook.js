import { log } from "../../../log.js";
import { amIFirstGm } from "../../../utils.js";
import { getLootToken } from "../main.js";
import { getCanvas } from "../settings.js";
export const updateItemHook = async (item, data, options, userId) => {
    log(`pick-up-stix | updateItemHook`);
    log([item, data, options, userId]);
    const itemFlags = item.getFlag('pick-up-stix', 'pick-up-stix');
    log(`pick-up-stix | updateItemHook | itemFlags:`);
    log([itemFlags]);
    if (!amIFirstGm()) {
        log(`pick-up-stix | updateItemHook | User is not GM`);
        return;
    }
    const lootTokens = getLootToken({ itemId: item.id });
    const updates = [];
    for (let lt of lootTokens) {
        updates.push({
            _id: lt.tokenId,
            width: itemFlags?.tokenData?.width ?? 1,
            height: itemFlags?.tokenData?.height ?? 1,
            name: item.data.name,
            img: itemFlags.container !== undefined
                ? (lt.isOpen
                    ? itemFlags.container.imageOpenPath
                    : itemFlags.container.imageClosePath)
                : item.data.img
        });
    }
    getCanvas().tokens.updateMany(updates);
};

//# sourceMappingURL=../../../maps/module/pick-up-stix/hooks/update-item-hook.js.map
