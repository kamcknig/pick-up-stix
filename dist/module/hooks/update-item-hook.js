import { log } from "../../main.js";
import { amIFirstGm } from "../utils.js";
import { getLootToken } from "../mainEntry.js";
import { getCanvas } from "../settings.js";
export const updateItemHook = async (item, data, options, userId) => {
    log(` updateItemHook`);
    log([item, data, options, userId]);
    const itemFlags = item.getFlag('pick-up-stix', 'pick-up-stix');
    log(` updateItemHook | itemFlags:`);
    log([itemFlags]);
    if (!amIFirstGm()) {
        log(` updateItemHook | User is not GM`);
        return;
    }
    const lootTokens = getLootToken({ itemId: item.id });
    for (let lt of lootTokens) {
        let updates = [];
        const update = {
            id: lt.tokenId,
            width: itemFlags?.tokenData?.width ?? 1,
            height: itemFlags?.tokenData?.height ?? 1,
            name: item.data.name,
            img: itemFlags.container !== undefined
                ? lt.isOpen
                    ? itemFlags.container.imageOpenPath
                    : itemFlags.container.imageClosePath
                : item.data.img,
        };
        updates.push(update);
        let token = getCanvas().tokens?.get(lt.tokenId);
        token.document.updateEmbeddedDocuments(token.document.documentName, updates);
    }
    // getCanvas().tokens?.updateAll(updates);
};
