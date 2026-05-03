import { dbg } from "./debugLog.mjs";

const MODULE_ID = "pick-up-stix";

export function dragModifiersHeld(event) {
  const reqCtrl = game.settings.get(MODULE_ID, "requireCtrlForDrag");

  // No modifier required → always allow.
  if (!reqCtrl) return true;

  const ctrlHeld = event
    ? !!(event.ctrlKey || event.metaKey)
    : game.keyboard.isModifierActive("CONTROL");

  dbg("dragModifier:check", { reqCtrl, ctrlHeld, allowed: ctrlHeld, hasEvent: !!event });
  return ctrlHeld;
}
