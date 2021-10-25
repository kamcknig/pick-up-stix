import { ItemType } from '../models';
import { getGame, PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME, SettingKeys } from '../settings';
import { ItemFlags } from '../loot-token';
import { error, log } from '../../main';
import { getCurrencyTypes } from '../utils';

export async function preCreateItemHook(itemData: any, options: any = {}, userId: string) {
  log(` preCreateItemHook | called with args:`);
  log([itemData, options, userId]);

  if (itemData.type.toLowerCase() === ItemType.CONTAINER) {
    log(' preCreateItemHook');

    const itemFlags: ItemFlags = {
      tokenData: {
        width: 1,
        height: 1,
        name: itemData.name,
        img: itemData.img ?? getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.closeImagePath),
        disposition: 0,
        //...(itemData.flags?.[PICK_UP_STIX_MODULE_NAME]?.[PICK_UP_STIX_FLAG]?.tokenData ?? {}),
        ...(getProperty(itemData, `flags.${PICK_UP_STIX_MODULE_NAME}.${PICK_UP_STIX_FLAG}.tokenData`) ?? {}),
      },
      container: {
        currency: Object.keys(getCurrencyTypes()).reduce((acc, shortName) => ({ ...acc, [shortName]: 0 }), {}),
        imageOpenPath: getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.openImagePath),
        imageClosePath: getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.closeImagePath),
        soundClosePath: getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.defaultContainerCloseSound),
        soundOpenPath: getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.defaultContainerOpenSound),
        //...(itemData.flags?.[PICK_UP_STIX_MODULE_NAME]?.[PICK_UP_STIX_FLAG]?.container ?? {}),
        ...(getProperty(itemData, `flags.${PICK_UP_STIX_MODULE_NAME}.${PICK_UP_STIX_FLAG}.container`) ?? {}),
      },
      itemType: ItemType.CONTAINER,
    };

    mergeObject(itemData, {
      // we checked for item type being container, but that isn't a "valid" type. The type of item has to be included in the
      // getGame().system.entityTypes.Item array. So we look for one that is "container-like"; backbpack because that's one that dnd
      // 5e uses, and if we don't find that we just take whatever thed first item type is. Really it doesn't even matter right now
      // as the type of this item isn't important, we use the flags itemType property to determine if it's an item or a container
      // anywhere else anyway
      type: getGame().system.entityTypes.Item.includes('backpack') ? 'backpack' : getGame().system.entityTypes.Item[0],
      folder: itemData.folder || getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.itemFolderId),
      img: itemFlags.tokenData.img,
      flags: {
        'pick-up-stix': {
          'pick-up-stix': itemFlags,
        },
      },
    });

    options.renderSheet = false;
  }

  log(` preCreateItemHook | final data:`);

  log(itemData);
}
