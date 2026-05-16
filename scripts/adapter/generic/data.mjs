const MODULE_ID = "pick-up-stix";
const NS = "interactive";

/**
 * Default interactive data shape for a freshly-created generic actor.
 * `mode` is null until the GM picks via the kind-picker dialog (existing
 * pick-up-stix.mjs flow); once chosen, it's "item" or "container".
 *
 * @returns {object}
 */
export function makeDefaultInteractiveData() {
  return {
    mode: null,
    name: "",
    img: "",
    description: "",
    isLocked: false,
    isOpen: false,
    lockedMessage: "",
    openImage: null,
    limitedName: "",
    limitedDescription: "",
    interactionRange: 1,
    inspectionRange: 4,
    itemData: null,   // mode="item":      {name, img, description, quantity}
    contents: []      // mode="container": Array<{id, name, img, description, quantity}>
  };
}

export const GenericData = {

  /**
   * Read the full interactive blob from the actor's flags. Returns the
   * default shape merged with whatever the actor has stored so callers
   * can rely on every key existing.
   *
   * @param {Actor} actor
   * @returns {object}
   */
  getInteractiveData(actor) {
    const stored = actor?.getFlag?.(MODULE_ID, NS) ?? {};
    return foundry.utils.mergeObject(
      makeDefaultInteractiveData(),
      stored,
      { inplace: false, insertKeys: true }
    );
  },

  /**
   * Persist a partial update to the interactive blob via setFlag.
   *
   * @param {Actor} actor
   * @param {object} partial
   * @returns {Promise<Actor>}
   */
  async setInteractiveData(actor, partial) {
    const current = this.getInteractiveData(actor);
    const next = foundry.utils.mergeObject(current, partial, { inplace: false });
    return actor.setFlag(MODULE_ID, NS, next);
  },

  // === Dispatcher abstractions (override base SystemAdapter implementations) ===

  isInteractiveContainer(actor) {
    return this.getInteractiveData(actor).mode === "container";
  },

  /**
   * Container actors always have an "embedded" view (the contents UI,
   * even if empty). Item actors only have one once itemData is set.
   *
   * @param {Actor} actor
   * @returns {boolean}
   */
  hasInteractiveEmbeddedItem(actor) {
    const data = this.getInteractiveData(actor);
    if (data.mode === "container") return true;
    return !!data.itemData;
  },

  /**
   * @param {Actor} actor
   * @returns {string}
   */
  getInteractiveDisplayName(actor) {
    const data = this.getInteractiveData(actor);
    return data.name || actor?.name || "";
  },

  /**
   * @param {Actor} actor
   * @returns {string}
   */
  getInteractiveLimitedName(actor) {
    const data = this.getInteractiveData(actor);
    if (data.limitedName) return data.limitedName;
    if (data.mode === "container") {
      return game.i18n.localize("INTERACTIVE_ITEMS.Limited.DefaultContainerName");
    }
    return game.i18n.format("INTERACTIVE_ITEMS.Limited.DefaultItemName", {
      type: game.i18n.localize("INTERACTIVE_ITEMS.Limited.DefaultItemTypeGeneric")
    });
  },

  /**
   * @param {Actor} actor
   * @returns {string}
   */
  getInteractiveLimitedDescription(actor) {
    const data = this.getInteractiveData(actor);
    let body = data.limitedDescription
      || game.i18n.localize("INTERACTIVE_ITEMS.Limited.DefaultDescription");
    if (data.mode === "container") {
      const stateKey = data.isOpen
        ? "INTERACTIVE_ITEMS.Limited.AppearsOpen"
        : "INTERACTIVE_ITEMS.Limited.AppearsClosed";
      body = `${body}\n<p>${game.i18n.localize(stateKey)}</p>`;
    }
    return body;
  },

  /** Read isOpen from the flag blob — actor.system has no such field on generic. */
  isInteractiveOpen(actor) {
    return !!this.getInteractiveData(actor).isOpen;
  },

  /** Read isLocked from the flag blob — actor.system has no such field on generic. */
  isInteractiveLocked(actor) {
    return !!this.getInteractiveData(actor).isLocked;
  },

  /** Write isOpen into the flag blob; the updateActor hook re-renders open sheets. */
  async setInteractiveOpenState(actor, isOpen) {
    await this.setInteractiveData(actor, { isOpen: !!isOpen });
  },

  /** Write isLocked into the flag blob. */
  async setInteractiveLockedState(actor, isLocked) {
    await this.setInteractiveData(actor, { isLocked: !!isLocked });
  },

  /** Read the per-actor locked message from flags, falling back to the default. */
  getInteractiveLockedMessage(actor) {
    const data = this.getInteractiveData(actor);
    return data.lockedMessage || game.i18n.localize("INTERACTIVE_ITEMS.Notify.Locked");
  },

  /** Read openImage from the flag blob — actor.system has no such field on generic. */
  getInteractiveOpenImage(actor) {
    return this.getInteractiveData(actor).openImage ?? null;
  }
};
