/**
 * dnd5e identification methods for the SystemAdapter contract.
 * dnd5e stores identification state as a boolean `system.identified` on the
 * item, and exposes unidentified presentation via `system.unidentified.name`
 * and `system.unidentified.description`.
 *
 * These methods are mixed into `Dnd5eAdapter` in `dnd5e/index.mjs`.
 */
export const Dnd5eIdentification = {

  /**
   * True if the item is currently identified. dnd5e treats `undefined` (field
   * absent) as identified, so the check is an explicit `!== false`.
   *
   * @param {Item} item
   * @returns {boolean}
   */
  isItemIdentified(item) {
    return item?.system?.identified !== false;
  },

  /**
   * Persist a new identification state on an existing item via dnd5e's native
   * `system.identified` boolean field.
   *
   * @param {Item} item
   * @param {boolean} isIdentified
   * @returns {Promise<Item>}
   */
  async setItemIdentified(item, isIdentified) {
    return item.update({ "system.identified": !!isIdentified });
  },

  /**
   * Read the unidentified name on the item (or null).
   *
   * @param {Item} item
   * @returns {string|null}
   */
  getItemUnidentifiedName(item) {
    return item?.system?.unidentified?.name ?? null;
  },

  /**
   * Read the unidentified description (HTML string) on the item (or null).
   *
   * @param {Item} item
   * @returns {string|null}
   */
  getItemUnidentifiedDescription(item) {
    return item?.system?.unidentified?.description ?? null;
  },

  /**
   * dnd5e has no per-item unidentified image field — always returns null.
   *
   * @param {Item} _item
   * @returns {null}
   */
  getItemUnidentifiedImage(_item) {
    return null;
  },

  /**
   * Build the embedded-item update payload that mirrors the actor's
   * identification state changes. `changes` is the `system` slice of an
   * Actor#update changeset (so we can detect which fields actually changed).
   *
   * @param {Actor} actor - The interactive actor whose system fields changed.
   * @param {object} changes - The `system` slice of the Actor#update changeset.
   * @returns {object} A flat update object suitable for `item.update(...)`.
   */
  buildItemIdentificationUpdate(actor, changes) {
    const u = {};
    if ("isIdentified" in changes) u["system.identified"] = actor.system.isIdentified;
    if ("unidentifiedName" in changes) u["system.unidentified.name"] = actor.system.unidentifiedName || "";
    if ("description" in changes) u["system.description.value"] = actor.system.description || "";
    if ("unidentifiedDescription" in changes) u["system.unidentified.description"] = actor.system.unidentifiedDescription || "";
    return u;
  },

  /**
   * Stamp identification status onto raw item data prior to `createDocuments`.
   * Used when initialising a freshly-dropped item.
   *
   * @param {object} itemData - Plain item data object (mutated in-place).
   * @param {boolean} isIdentified
   * @returns {object} The mutated itemData.
   */
  stampNewItemIdentified(itemData, isIdentified) {
    itemData.system = itemData.system ?? {};
    itemData.system.identified = !!isIdentified;
    return itemData;
  }
};
