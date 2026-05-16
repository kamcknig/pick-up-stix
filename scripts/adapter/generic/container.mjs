const MODULE_ID = "pick-up-stix";

/**
 * Container mixin for the generic adapter.
 *
 * Container-parent linking is flag-based (used when generic mode creates a
 * pickup stub in Phase 7). The generic adapter never creates system-level
 * container items, so `getItemContainerId` / `setItemContainerId` operate
 * on the same flag namespace as the dnd5e/pf2e adapters for compatibility
 * with the shared transfer utilities.
 */
export const GenericContainer = {
  /**
   * @param {Item} item
   * @returns {string|null}
   */
  getItemContainerId(item) {
    return item?.getFlag?.(MODULE_ID, "containerId") ?? null;
  },

  /**
   * @param {object} itemData - Raw item data object (pre-create).
   * @param {string|null} containerId
   */
  setItemContainerId(itemData, containerId) {
    foundry.utils.setProperty(
      itemData,
      `flags.${MODULE_ID}.containerId`,
      containerId ?? null
    );
  },

  /**
   * Flatten a list of items into plain data objects ready for createDocuments,
   * assigning new random IDs and optionally transforming each entry.
   *
   * @param {Array<foundry.abstract.Document|object>} items
   * @param {{ transformAll?: (data: object) => object|null }} [options]
   * @returns {Promise<object[]>}
   */
  async flattenItemsForCreate(items, options = {}) {
    const { transformAll } = options;
    const out = [];
    for (const src of items) {
      const data = src instanceof foundry.abstract.Document
        ? src.toObject()
        : foundry.utils.deepClone(src);
      data._id = foundry.utils.randomID();
      const result = transformAll ? transformAll(data) : data;
      if (result != null) out.push(result);
    }
    return out;
  },

  /**
   * Flatten items and create them via the document class.
   *
   * @param {Array<foundry.abstract.Document|object>} items
   * @param {{ parent?: foundry.abstract.Document }} [options]
   * @returns {Promise<foundry.abstract.Document[]>}
   */
  async createItemsWithContents(items, options = {}) {
    const flat = await this.flattenItemsForCreate(items);
    const createOptions = { keepId: true };
    if (options.parent) createOptions.parent = options.parent;
    return CONFIG.Item.documentClass.createDocuments(flat, createOptions);
  }
};
