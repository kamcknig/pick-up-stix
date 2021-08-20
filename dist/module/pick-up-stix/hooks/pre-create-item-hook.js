import { ItemType } from "../models.js";
import { SettingKeys } from "../settings.js";
import { getCurrencyTypes } from "../../../utils.js";
import { log } from "../../../log.js";
export async function preCreateItemHook(itemData, options = {}, userId) {
    log(`pick-up-stix | preCreateItemHook | called with args:`);
    log([itemData, options, userId]);
    if (itemData.type.toLowerCase() === ItemType.CONTAINER) {
        log('pick-up-stix | preCreateItemHook');
        const itemFlags = {
            tokenData: {
                width: 1,
                height: 1,
                name: itemData.name,
                img: itemData.img ?? game.settings.get('pick-up-stix', SettingKeys.closeImagePath),
                disposition: 0,
                ...itemData.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData ?? {}
            },
            container: {
                currency: Object.keys(getCurrencyTypes()).reduce((acc, shortName) => ({ ...acc, [shortName]: 0 }), {}),
                imageOpenPath: game.settings.get('pick-up-stix', SettingKeys.openImagePath),
                imageClosePath: game.settings.get('pick-up-stix', SettingKeys.closeImagePath),
                soundClosePath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerCloseSound),
                soundOpenPath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerOpenSound),
                ...itemData.flags?.['pick-up-stix']?.['pick-up-stix']?.container ?? {}
            },
            itemType: ItemType.CONTAINER
        };
        mergeObject(itemData, {
            // we checked for item type being container, but that isn't a "valid" type. The type of item has to be included in the
            // game.system.entityTypes.Item array. So we look for one that is "container-like"; backbpack because that's one that dnd
            // 5e uses, and if we don't find that we just take whatever thed first item type is. Really it doesn't even matter right now
            // as the type of this item isn't important, we use the flags itemType property to determine if it's an item or a container
            // anywhere else anyway
            type: game.system.entityTypes.Item.includes('backpack') ? 'backpack' : game.system.entityTypes.Item[0],
            folder: itemData.folder || game.settings.get('pick-up-stix', SettingKeys.itemFolderId),
            img: itemFlags.tokenData.img,
            flags: {
                'pick-up-stix': {
                    'pick-up-stix': itemFlags
                }
            }
        });
        options.renderSheet = false;
    }
    log(`pick-up-stix | preCreateItemHook | final data:`);
    log(itemData);
}

//# sourceMappingURL=../../../maps/module/pick-up-stix/hooks/pre-create-item-hook.js.map
