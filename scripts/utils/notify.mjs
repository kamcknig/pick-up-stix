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

/**
 * Buyer sees "You purchased …"; the processing GM sees "{player} purchased …".
 * When quantity > 1 the message includes a ×N quantifier (…Qty key variant).
 */
export function notifyPurchase(itemName, vendorName, quantity = 1) {
  const qty = Math.max(1, Number(quantity) || 1);
  const suffix = qty > 1 ? "Qty" : "";
  const data = { name: itemName, vendor: vendorName, quantity: qty };
  if (game.user.isGM && _currentInitiatorUserId && _currentInitiatorUserId !== game.user.id) {
    const initiator = game.users.get(_currentInitiatorUserId);
    if (initiator) {
      ui.notifications.info(game.i18n.format(
        `INTERACTIVE_ITEMS.Notify.Purchased${suffix}ByPlayer`,
        { ...data, player: initiator.name }
      ));
      return;
    }
  }
  ui.notifications.info(game.i18n.format(`INTERACTIVE_ITEMS.Notify.Purchased${suffix}`, data));
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
