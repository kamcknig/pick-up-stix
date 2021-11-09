import { log } from '../../main';
import ContainerConfigApplication from '../container-config';
import { ItemFlags } from '../loot-token';
import { ItemType } from '../models';
import { getGame, PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME, SettingKeys } from '../settings';
import { getCurrencyTypes } from '../utils';

export async function createItemHook(item: Item, options: any, userId: string) {
  log(` createItemHook | called with args:`);
  log([item, options, userId]);

  // change the type back to 'container' so that our item config sheet works. When the item is created, we created it with
  // the 'backpack' type because we are forced to use an existing item type. but then after we make it just switch it back.
  if (
    (<ItemFlags>item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG))?.itemType === ItemType.CONTAINER
    || item.name?.toLowerCase().startsWith("Pick Up".toLowerCase()) 
    ) {
      if(!<ItemFlags>item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG)){
        const itemFlags: ItemFlags = {
          tokenData: {
            width: 1,
            height: 1,
            name: item.name,
            img: item.img ?? getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.closeImagePath),
            disposition: 0,
            ...(getProperty(item, `flags.${PICK_UP_STIX_MODULE_NAME}.${PICK_UP_STIX_FLAG}.tokenData`) ?? {}),
          },
          container: {
            currency: Object.keys(getCurrencyTypes()).reduce((acc, shortName) => ({ ...acc, [shortName]: 0 }), {}),
            imageOpenPath: getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.openImagePath),
            imageClosePath: getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.closeImagePath),
            soundClosePath: getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.defaultContainerCloseSound),
            soundOpenPath: getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.defaultContainerOpenSound),
            ...(getProperty(item, `flags.${PICK_UP_STIX_MODULE_NAME}.${PICK_UP_STIX_FLAG}.container`) ?? {}),
          },
          itemType: ItemType.CONTAINER,
        };
        
        //setProperty(item.data, 'sheet', ContainerConfigApplication);

        mergeObject(item.data, {
          // we checked for item type being container, but that isn't a "valid" type. The type of item has to be included in the
          // getGame().system.entityTypes.Item array. So we look for one that is "container-like"; backbpack because that's one that dnd
          // 5e uses, and if we don't find that we just take whatever thed first item type is. Really it doesn't even matter right now
          // as the type of this item isn't important, we use the flags itemType property to determine if it's an item or a container
          // anywhere else anyway
          type: ItemType.BACKPACK, // IT WAS ItemType.CONTAINER
          folder: item.folder || getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.itemFolderId),
          img: itemFlags.tokenData.img,
          flags: {
            'pick-up-stix': {
              'pick-up-stix': itemFlags,
            },
          },
          options: {
            renderSheet : false
          }
        });
      }else{
        item.data.type = ItemType.BACKPACK; // IT WAS ItemType.CONTAINER
      }
  }
}
