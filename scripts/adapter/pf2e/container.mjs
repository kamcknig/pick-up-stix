/**
 * pf2e container-parent and deep-create methods for the SystemAdapter contract.
 *
 * pf2e uses `system.containerId` (a plain string | null) to track the
 * parent-container item's id. The item type for containers is "backpack"
 * (pf2e registers ContainerSheetPF2e for the "backpack" type). pf2e has no
 * native equivalent of dnd5e's `Item5e.createWithContents`, so this adapter
 * walks `system.contents` manually.
 *
 * Verified against pf2e 8.1.0 source (pf2e.mjs):
 * - `system.containerId` is a plain string or null (modern API; the legacy
 *   `{ value: null }` shape is normalised during migration and no longer
 *   appears on live documents).
 * - `item.type === "backpack"` is the canonical container type check.
 * - `"equipment"` is the closest pf2e analog to dnd5e's "loot" — a generic
 *   physical item with no special sub-type semantics.
 *
 * These methods are mixed into `Pf2eAdapter` in `pf2e/index.mjs`.
 */
export const Pf2eContainer = {

  /**
   * Item type for containers. pf2e calls these "backpack" items; the
   * ContainerSheetPF2e sheet is registered for this type.
   *
   * @type {string}
   */
  containerItemType: "backpack",

  /**
   * Item type for generic loot created from scratch. pf2e has no "loot" item
   * type; "equipment" is the closest physical-item analog.
   *
   * @type {string}
   */
  defaultLootItemType: "equipment",

  /**
   * Read the parent-container id (or null) from a live pf2e Item.
   * pf2e stores this as a plain string in `system.containerId`.
   *
   * @param {Item} item
   * @returns {string|null}
   */
  getItemContainerId(item) {
    return item?.system?.containerId ?? null;
  },

  /**
   * Stamp the parent-container id onto raw item data prior to create/update.
   * pf2e uses `system.containerId` (plain string) for this relationship.
   *
   * @param {object} itemData - Plain item data object (mutated in-place).
   * @param {string|null} containerId - Id of the parent container item.
   */
  setItemContainerId(itemData, containerId) {
    itemData.system = itemData.system ?? {};
    itemData.system.containerId = containerId;
  },

  /**
   * Deep-create a container plus its nested contents using a hand-rolled walker.
   *
   * pf2e has no native equivalent of dnd5e's `Item5e.createWithContents`.
   * This method:
   *   1. Clones each input item (or plain data object).
   *   2. Assigns a fresh `_id` to each clone so callers can reference them.
   *   3. Stamps `system.containerId` on each child to point at its parent.
   *   4. Recurses into `system.contents` (pf2e may store nested items there)
   *      up to a maximum depth of 5 to match dnd5e's MAX_DEPTH convention.
   *   5. Calls `CONFIG.Item.documentClass.createDocuments` with `keepId: true`
   *      so the pre-assigned ids are honoured.
   *
   * @param {object[]|Item[]} items - Items to create (plain data or live documents).
   * @param {object} [options] - Options forwarded to `createDocuments`. May include `parent`.
   * @returns {Promise<Item[]>}
   */
  /**
   * Flatten items into plain data objects by walking `system.contents`
   * recursively. pf2e has no `createWithContents` equivalent.
   *
   * @param {Item[]|object[]} items
   * @param {object} [options]
   * @param {(itemData: object) => object|null} [options.transformAll]
   * @returns {Promise<object[]>}
   */
  async flattenItemsForCreate(items, options = {}) {
    const { transformAll } = options;
    const flat = [];
    const MAX_DEPTH = 5;
    const walk = (list, parentId, depth) => {
      if (depth > MAX_DEPTH) return;
      for (const src of list) {
        const data = src instanceof foundry.abstract.Document
          ? src.toObject()
          : foundry.utils.deepClone(src);
        if (parentId) {
          data.system = data.system ?? {};
          data.system.containerId = parentId;
        }
        const newId = foundry.utils.randomID();
        data._id = newId;
        const children = Array.isArray(data.system?.contents) ? data.system.contents : [];
        if (data.system?.contents) delete data.system.contents;
        const result = transformAll ? transformAll(data) : data;
        if (result != null) flat.push(result);
        if (children.length) walk(children, newId, depth + 1);
      }
    };
    walk(items, null, 0);
    return flat;
  },

  async createItemsWithContents(items, options = {}) {
    const flat = [];
    const MAX_DEPTH = 5;

    /**
     * Recursively flatten a list of items (and their `system.contents`) into
     * a single array, stamping parent ids as we go.
     *
     * @param {object[]|Item[]} list
     * @param {string|null} parentId
     * @param {number} depth
     */
    const walk = (list, parentId, depth) => {
      if (depth > MAX_DEPTH) return;
      for (const itemSrc of list) {
        const data = foundry.utils.deepClone(
          itemSrc instanceof Item ? itemSrc.toObject() : itemSrc
        );
        const newId = foundry.utils.randomID();
        data._id = newId;
        if (parentId) {
          data.system = data.system ?? {};
          data.system.containerId = parentId;
        }
        // Extract and remove nested contents before pushing so we don't
        // persist the contents array on the created item.
        const children = data.system?.contents ?? [];
        if (data.system?.contents) delete data.system.contents;
        flat.push(data);
        if (children.length) walk(children, newId, depth + 1);
      }
    };

    walk(items, null, 0);

    const createOptions = { keepId: true };
    if (options.parent) createOptions.parent = options.parent;
    return CONFIG.Item.documentClass.createDocuments(flat, createOptions);
  }
};
