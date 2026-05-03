export function notifyItemAction(key, itemName) {
  ui.notifications.info(
    game.i18n.format(`INTERACTIVE_ITEMS.Notify.${key}`, { name: itemName })
  );
}

export function notifyTooFar() {
  ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.TooFar"));
}

export function notifyContainerClosed() {
  ui.notifications.warn(game.i18n.localize("INTERACTIVE_ITEMS.Notify.ContainerClosed"));
}

export function notifyTransferError() {
  ui.notifications.error(game.i18n.localize("INTERACTIVE_ITEMS.Notify.TransferError"));
}
