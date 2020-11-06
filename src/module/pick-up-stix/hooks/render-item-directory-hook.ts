export const renderItemDirectoryHook = async (directory, html, options: {canCreate: boolean; sidebarIcon: string; tree: any, user: any }) => {
  if (game.user.isGM) {
    return;
  }

  $(html).find(`.directory-item.entity.item`).css('display', 'none');
}
