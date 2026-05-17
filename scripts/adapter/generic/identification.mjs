/**
 * Identification mixin for the generic adapter.
 *
 * Every method is a safe no-op — identification UI is hidden via the
 * `supportsIdentification: false` capability gate, so most stubs are never
 * reached in practice. They exist to satisfy the SystemAdapter contract so
 * the generic adapter can be used as a drop-in replacement without runtime
 * errors if a call site somehow bypasses the gate.
 */
export const GenericIdentification = {
  isItemIdentified(_item) { return true; },
  async setItemIdentified(item, _isIdentified) { return item; },
  getItemUnidentifiedName(_item) { return null; },
  getItemUnidentifiedDescription(_item) { return null; },
  getItemUnidentifiedImage(_item) { return null; },
  buildItemIdentificationUpdate(_actor, _changes) { return {}; },
  buildEmbeddedItemSourceUpdate(_actor, _isIdentified) { return {}; },
  parseEmbeddedItemChanges(_item, _changes, _actor) { return {}; },
  isIdentificationChange(_item, _changes) { return false; },
  stampNewItemIdentified(itemData, _isIdentified) { return itemData; },
  async performIdentifyToggle(_item) { /* no-op */ },
  isPhysicalItem(item) { return item != null && item.system != null; }
};
