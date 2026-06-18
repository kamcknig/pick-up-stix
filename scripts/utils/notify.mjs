// Per-call initiator context. SocketHandler sets this before invoking a
// player-dispatched handler so the GM's notification can name the player.
// Module-level state is fine here because socket handlers are short-lived and
// only one human-driven action enters this slot at a time; the finally-clear
// in SocketHandler protects against errors leaving stale state behind.
let _currentInitiatorUserId = null;

export function setInitiator(userId) {
  _currentInitiatorUserId = userId ?? null;
}

export function clearInitiator() {
  _currentInitiatorUserId = null;
}

export function notifyItemAction(key, itemName) {
  // On the GM client, attribute the action to the originating player when the
  // socket handler set an initiator that isn't the GM themselves.
  if (game.user.isGM && _currentInitiatorUserId && _currentInitiatorUserId !== game.user.id) {
    const initiator = game.users.get(_currentInitiatorUserId);
    if (initiator) {
      ui.notifications.info(
        game.i18n.format(`INTERACTIVE_ITEMS.Notify.${key}ByPlayer`, {
          name: itemName,
          player: initiator.name
        })
      );
      return;
    }
  }
  ui.notifications.info(
    game.i18n.format(`INTERACTIVE_ITEMS.Notify.${key}`, { name: itemName })
  );
}

/** Buyer sees "You purchased N items from …"; the processing GM sees "{player} purchased N items from …". */
export function notifyPurchaseCart(count, vendorName) {
  if (game.user.isGM && _currentInitiatorUserId && _currentInitiatorUserId !== game.user.id) {
    const initiator = game.users.get(_currentInitiatorUserId);
    if (initiator) {
      ui.notifications.info(game.i18n.format(
        "INTERACTIVE_ITEMS.Notify.PurchasedCartByPlayer",
        { player: initiator.name, count, vendor: vendorName }
      ));
      return;
    }
  }
  ui.notifications.info(game.i18n.format(
    "INTERACTIVE_ITEMS.Notify.PurchasedCart", { count, vendor: vendorName }
  ));
}

/** Buyer sees "You purchased …"; the processing GM sees "{player} purchased …". */
export function notifyPurchase(itemName, vendorName) {
  if (game.user.isGM && _currentInitiatorUserId && _currentInitiatorUserId !== game.user.id) {
    const initiator = game.users.get(_currentInitiatorUserId);
    if (initiator) {
      ui.notifications.info(game.i18n.format(
        "INTERACTIVE_ITEMS.Notify.PurchasedByPlayer",
        { player: initiator.name, name: itemName, vendor: vendorName }
      ));
      return;
    }
  }
  ui.notifications.info(game.i18n.format(
    "INTERACTIVE_ITEMS.Notify.Purchased", { name: itemName, vendor: vendorName }
  ));
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
