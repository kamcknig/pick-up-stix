/**
 * dnd5e container-parent and deep-create methods for the SystemAdapter contract.
 * dnd5e uses `system.container` to track the parent-container item's id, and
 * exposes a static `Item5e.createWithContents` helper for deep-creating
 * container hierarchies.
 *
 * These methods are mixed into `Dnd5eAdapter` in `dnd5e/index.mjs`.
 */
export const Dnd5eContainer = {

  /**
   * Item type for containers. dnd5e calls this "container" (the legacy
   * "backpack" type is auto-migrated by Item5e._initializeSource).
   *
   * @type {string}
   */
  containerItemType: "container",

  /**
   * Item type for generic loot we create from scratch.
   *
   * @type {string}
   */
  defaultLootItemType: "loot",

  /**
   * Read the parent-container id (or null) from a live Item.
   * dnd5e stores this in `system.container`.
   *
   * @param {Item} item
   * @returns {string|null}
   */
  getItemContainerId(item) {
    return item?.system?.container ?? null;
  },

  /**
   * Stamp the parent-container id onto raw item data prior to create/update.
   * dnd5e uses `system.container` for this relationship.
   *
   * @param {object} itemData - Plain item data object (mutated in-place).
   * @param {string} containerId - Id of the parent container item.
   */
  setItemContainerId(itemData, containerId) {
    itemData.system = itemData.system ?? {};
    itemData.system.container = containerId;
  },

  /**
   * Deep-create a container plus its nested contents using the dnd5e static
   * helper `Item5e.createWithContents`. This mirrors the behaviour of the
   * existing core code that calls the helper directly; the adapter wraps it so
   * pf2e (and future systems) can substitute a hand-rolled walker.
   *
   * @param {object[]|Item[]} items - Items to create (may be plain data or live documents).
   * @param {object} [options] - Options forwarded to `createDocuments`. May include `parent`.
   * @returns {Promise<Item[]>}
   */
  async createItemsWithContents(items, options) {
    const docs = await CONFIG.Item.documentClass.createWithContents(items, options);
    if (options?.parent) {
      return CONFIG.Item.documentClass.createDocuments(docs, { parent: options.parent, keepId: options.keepId ?? false });
    }
    return CONFIG.Item.documentClass.createDocuments(docs, { keepId: options?.keepId ?? false });
  },

  /**
   * Flatten items into plain data objects using dnd5e's native
   * `Item5e.createWithContents` which handles nested container hierarchies.
   *
   * @param {Item[]|object[]} items
   * @param {object} [options]
   * @param {(itemData: object) => object|null} [options.transformAll]
   * @returns {Promise<object[]>}
   */
  async flattenItemsForCreate(items, options = {}) {
    return CONFIG.Item.documentClass.createWithContents(items, options);
  }
};
