import { ItemFlags } from '../loot-token';
import { getGame, PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME, SettingKeys } from '../settings';

export const renderItemDirectoryHook = async (
  directory,
  html,
  options: { canCreate: boolean; sidebarIcon: string; tree: any; user: any },
) => {
  if (getGame().user?.isGM) {
    return;
  }

  $(html)
    .find('.directory-item.folder')
    .each(function (i, el) {
      const folderId = el.dataset['folderId'];
      if (
        [
          getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.parentItemFolderId),
          getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.itemFolderId),
          getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.tokenFolderId),
        ].includes(folderId)
      ) {
        $(el).css('display', 'none');
      }
    });

  $(html)
    .find(`.directory-item.entity.item`)
    .each(function (i, el) {
      const itemId = <string>el.dataset['entityId'];
      const item = <Item>getGame().items?.get(itemId);
      if ((<ItemFlags>item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG)).itemType !== undefined) {
        $(el).css('display', 'none');
      }
    });
};
