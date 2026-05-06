import { dbg } from "./debugLog.mjs";

/**
 * Prompt the user for a quantity to move from a stack of items.
 *
 * Renders a `DialogV2` with a number input clamped to `[1, max]`, **Min**
 * (sets to 1) and **Max** (sets to max) shortcut buttons inline, and
 * **Confirm** / **Cancel** footer buttons. Closing the window via the X is
 * treated as cancel.
 *
 * @param {object} args
 * @param {string} args.itemName - Item display name shown in the title.
 * @param {number} args.max - Source stack quantity (also the default value).
 * @param {string} [args.actionKey="INTERACTIVE_ITEMS.Dialog.QuantityActionMove"]
 *   - i18n key for the "what action are we performing" hint
 *     (e.g. "Move to canvas", "Deposit into container", "Give to {target}").
 * @param {object} [args.actionFormatArgs] - i18n format args for actionKey.
 * @returns {Promise<number|null>} - Chosen quantity, or null on cancel.
 */
export async function promptItemQuantity({
  itemName,
  max,
  actionKey = "INTERACTIVE_ITEMS.Dialog.QuantityActionMove",
  actionFormatArgs = {}
}) {
  if (!Number.isFinite(max) || max <= 1) {
    dbg("qty:promptItemQuantity", "max <= 1, skipping prompt", { itemName, max });
    return Number.isFinite(max) && max >= 1 ? Math.floor(max) : 1;
  }

  const action = game.i18n.format(actionKey, actionFormatArgs);

  const content = `
    <p class="ii-quantity-action">${action}</p>
    <div class="form-group ii-quantity-row">
      <label for="ii-quantity-input">${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.QuantityLabel")}</label>
      <div class="form-fields ii-quantity-fields">
        <button type="button" class="ii-quantity-shortcut" data-shortcut="min" data-tooltip="${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.QuantityMin")}">
          ${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.QuantityMin")}
        </button>
        <input type="number" id="ii-quantity-input" name="quantity"
               min="1" max="${max}" value="${max}" step="1" autocomplete="off" />
        <button type="button" class="ii-quantity-shortcut" data-shortcut="max" data-tooltip="${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.QuantityMax")}">
          ${game.i18n.localize("INTERACTIVE_ITEMS.Dialog.QuantityMax")}
        </button>
      </div>
      <p class="hint">${game.i18n.format("INTERACTIVE_ITEMS.Dialog.QuantityRange", { max })}</p>
    </div>
  `;

  dbg("qty:promptItemQuantity", "rendering dialog", { itemName, max });

  const result = await foundry.applications.api.DialogV2.wait({
    window: {
      title: game.i18n.format("INTERACTIVE_ITEMS.Dialog.QuantityTitle", { name: itemName }),
      classes: ["ii-quantity-dialog"]
    },
    content,
    render: (event, dialog) => {
      const root  = dialog.element;
      const input = root.querySelector('input[name="quantity"]');
      if (!input) return;

      const clamp = () => {
        let v = parseInt(input.value, 10);
        if (!Number.isFinite(v) || v < 1) v = 1;
        else if (v > max) v = max;
        input.value = String(v);
      };

      input.addEventListener("blur",   clamp);
      input.addEventListener("change", clamp);

      root.querySelectorAll(".ii-quantity-shortcut").forEach(btn => {
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          input.value = btn.dataset.shortcut === "min" ? "1" : String(max);
        });
      });

      // Pre-select the input contents so typing replaces the default.
      requestAnimationFrame(() => { input.focus(); input.select(); });
    },
    buttons: [
      {
        action: "confirm",
        label: game.i18n.localize("INTERACTIVE_ITEMS.Dialog.QuantityConfirm"),
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const raw = button.form?.elements.quantity?.value ?? max;
          let v = parseInt(raw, 10);
          if (!Number.isFinite(v) || v < 1) v = 1;
          if (v > max) v = max;
          return v;
        }
      },
      {
        action: "cancel",
        label: game.i18n.localize("INTERACTIVE_ITEMS.Dialog.QuantityCancel"),
        icon: "fa-solid fa-xmark"
      }
    ],
    rejectClose: false
  });

  if (result === null || result === undefined) {
    dbg("qty:promptItemQuantity", "cancelled");
    return null;
  }
  dbg("qty:promptItemQuantity", "confirmed", { itemName, chosen: result });
  return result;
}

/**
 * Decrement the source item's quantity by `chosen`, or delete it outright
 * when `chosen >= source quantity`. Used after a partial-stack move where
 * the destination has already been written.
 *
 * No-op (and emits a dbg warning) if the live item is missing or the chosen
 * amount is non-positive — the destination side is responsible for refusing
 * to write in that case.
 *
 * @param {Item} item - Live source item document.
 * @param {number} chosen - Quantity that was moved to the destination.
 * @returns {Promise<void>}
 */
export async function decrementOrDeleteItem(item, chosen) {
  if (!item) {
    dbg("qty:decrementOrDeleteItem", "no item passed, skip");
    return;
  }
  if (!Number.isFinite(chosen) || chosen <= 0) {
    dbg("qty:decrementOrDeleteItem", "non-positive chosen, skip", { chosen });
    return;
  }

  // Read through the adapter so a future system with a different field
  // path is supported without touching this helper. Imported lazily to
  // avoid a circular import with the adapter dispatcher.
  const { getAdapter } = await import("../adapter/index.mjs");
  const sourceQty = getAdapter().getItemQuantity(item);

  if (chosen >= sourceQty) {
    dbg("qty:decrementOrDeleteItem", "chosen >= sourceQty, deleting", { chosen, sourceQty, itemId: item.id });
    await item.delete({ deleteContents: true });
    return;
  }

  const remaining = sourceQty - chosen;
  dbg("qty:decrementOrDeleteItem", "decrementing source", { itemId: item.id, sourceQty, chosen, remaining });
  await item.update({ "system.quantity": remaining });
}
