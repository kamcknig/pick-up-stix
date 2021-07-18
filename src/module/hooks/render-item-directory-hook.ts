import { SettingKeys } from "../settings";

export const renderItemDirectoryHook = async (directory, html, options: {canCreate: boolean; sidebarIcon: string; tree: any, user: any }) => {
  if (game.user.isGM) {
    return;
  }

  $(html).find('.directory-item.folder').each(function (i, el) {
    const folderId = el.dataset['folderId'];
    if([
      game.settings.get('pick-up-stix', SettingKeys.parentItemFolderId),
      game.settings.get('pick-up-stix', SettingKeys.itemFolderId),
      game.settings.get('pick-up-stix', SettingKeys.tokenFolderId)
    ].includes(folderId)) {
      $(el).css('display', 'none');
    }
  });

  $(html).find(`.directory-item.entity.item`).each(function (i, el) {
    const itemId = el.dataset['entityId'];
    const item = game.items.get(itemId);
    if (item.getFlag('pick-up-stix', 'pick-up-stix.itemType') !== undefined) {
      $(el).css('display', 'none');
    }
  });
}
