/**
 * pf2e identification methods for the SystemAdapter contract.
 *
 * pf2e stores identification state as an enum string `system.identification.status`
 * on physical items ("identified" | "unidentified"), and stores unidentified
 * presentation data under `system.identification.unidentified.{name, img,
 * data.description.value}`.
 *
 * Verified against pf2e 8.1.0 source (pf2e.mjs):
 * - `system.identification.status` — "identified" | "unidentified"
 * - `item.setIdentificationStatus(status)` — sets status and backfills mystifiedData
 * - `system.identification.unidentified.name` — unidentified display name
 * - `system.identification.unidentified.img` — unidentified display image
 * - `system.identification.unidentified.data.description.value` — unidentified
 *   description HTML (confirmed via the enrichHTML call in PhysicalItemSheetPF2e)
 *
 * These methods are mixed into `Pf2eAdapter` in `pf2e/index.mjs`.
 */
import { Pf2eIdentifyPopup } from "./IdentifyPopup.mjs";

export const Pf2eIdentification = {

  /**
   * True if the item is currently identified. pf2e uses an enum string:
   * "identified" | "unidentified".
   *
   * @param {Item} item
   * @returns {boolean}
   */
  isItemIdentified(item) {
    return item?.system?.identification?.status === "identified";
  },

  /**
   * Persist a new identification status on an existing item. Uses pf2e's
   * native `setIdentificationStatus` method which fills in mystified data and
   * fires expected hooks. Falls back to a direct `item.update` if the method
   * is absent (defensive guard for future pf2e API changes).
   *
   * @param {Item} item
   * @param {boolean} isIdentified
   * @returns {Promise<Item>}
   */
  async setItemIdentified(item, isIdentified) {
    const status = isIdentified ? "identified" : "unidentified";
    if (typeof item.setIdentificationStatus === "function") {
      return item.setIdentificationStatus(status);
    }
    // Fallback: direct field update if the method is unavailable.
    console.warn("pick-up-stix | pf2e: setIdentificationStatus not found on item; falling back to direct update");
    return item.update({ "system.identification.status": status });
  },

  /**
   * Read the unidentified display name on the item (or null).
   *
   * @param {Item} item
   * @returns {string|null}
   */
  getItemUnidentifiedName(item) {
    return item?.system?.identification?.unidentified?.name ?? null;
  },

  /**
   * Read the unidentified description (HTML string) on the item (or null).
   * pf2e nests this at `system.identification.unidentified.data.description.value`.
   *
   * @param {Item} item
   * @returns {string|null}
   */
  getItemUnidentifiedDescription(item) {
    return item?.system?.identification?.unidentified?.data?.description?.value ?? null;
  },

  /**
   * Read the unidentified image path on the item (or null). pf2e stores this at
   * `system.identification.unidentified.img`.
   *
   * @param {Item} item
   * @returns {string|null}
   */
  getItemUnidentifiedImage(item) {
    return item?.system?.identification?.unidentified?.img ?? null;
  },

  /**
   * Build the embedded-item update payload that mirrors the actor's identification
   * state changes into the pf2e item's `system.identification.*` fields. `changes`
   * is the `system` slice of an Actor#update changeset (so we can detect which
   * fields actually changed).
   *
   * @param {Actor} actor - The interactive actor whose system fields changed.
   * @param {object} changes - The `system` slice of the Actor#update changeset.
   * @returns {object} A flat update object suitable for `item.update(...)`.
   */
  buildItemIdentificationUpdate(actor, changes) {
    const u = {};
    if ("isIdentified" in changes) {
      u["system.identification.status"] = actor.system.isIdentified ? "identified" : "unidentified";
    }
    if ("unidentifiedName" in changes) {
      u["system.identification.unidentified.name"] = actor.system.unidentifiedName || "";
    }
    if ("description" in changes) {
      u["system.description.value"] = actor.system.description || "";
    }
    if ("unidentifiedDescription" in changes) {
      u["system.identification.unidentified.data.description.value"] = actor.system.unidentifiedDescription || "";
    }
    return u;
  },

  /**
   * pf2e item sheets bind the name input to `item._source.name` regardless
   * of identification state. When the GM edits that input we route the
   * change to the wrapping actor:
   *   identified   → actor.name (canonical real name)
   *   unidentified → actor.system.unidentifiedName (mystified label)
   *
   * The downstream `updateActor` flow propagates further: identified writes
   * fan out to the prototype/synthetic token name, unidentified writes flow
   * through `buildItemIdentificationUpdate` to update
   * `system.identification.unidentified.name` on the embedded item.
   *
   * Returns `{}` when nothing needs to change so the caller can skip the
   * update (also avoids needless hook fan-out).
   */
  parseEmbeddedItemNameChange(item, changes, actor) {
    if (!("name" in changes)) return {};
    const newName = changes.name;
    if (typeof newName !== "string") return {};
    const isIdentified = actor.system.isIdentified;
    if (isIdentified) {
      if (actor.name === newName) return {};
      return { name: newName };
    }
    if (actor.system.unidentifiedName === newName) return {};
    return { "system.unidentifiedName": newName };
  },

  buildEmbeddedItemSourceUpdate(actor, isIdentified) {
    const item = actor.system.embeddedItem;
    if (!item) return {};
    let desired;
    if (isIdentified) {
      desired = actor.name;
    } else {
      desired = actor.system.unidentifiedName
        || (typeof item.generateUnidentifiedName === "function"
            ? item.generateUnidentifiedName()
            : "")
        || actor.name;
    }
    if (!desired) return {};

    // Mirror the desired value into both `_source.name` (the in-sheet input)
    // and pf2e's per-state cache. pf2e populates
    // `system.identification.identified` once via `??=` from the initial
    // source name, then relies on `getMystifiedData(status)` to drive
    // `this.name` in `prepareDerivedData`. Without updating the cache, a
    // later identify cycle resurrects the stale original name.
    const update = {};
    if (item._source?.name !== desired) update.name = desired;
    const cachePath = isIdentified
      ? "system.identification.identified.name"
      : "system.identification.unidentified.name";
    const currentCache = foundry.utils.getProperty(item._source ?? {}, cachePath);
    if (currentCache !== desired) update[cachePath] = desired;
    return update;
  },

  /**
   * Stamp identification status onto raw item data prior to `createDocuments`.
   * Used when initialising a freshly-dropped pf2e item. Sets
   * `system.identification.status` to the appropriate enum string.
   *
   * @param {object} itemData - Plain item data object (mutated in-place).
   * @param {boolean} isIdentified
   * @returns {object} The mutated itemData.
   */
  stampNewItemIdentified(itemData, isIdentified) {
    itemData.system = itemData.system ?? {};
    itemData.system.identification = itemData.system.identification ?? {};
    itemData.system.identification.status = isIdentified ? "identified" : "unidentified";
    return itemData;
  },

  /**
   * True if the updateItem changeset contains pf2e's identification block.
   * pf2e stores identification state at system.identification.status and
   * updates arrive as changes.system.identification (a nested object).
   *
   * @param {Item} item
   * @param {object} changes
   * @returns {boolean}
   */
  isIdentificationChange(item, changes) {
    return changes.system?.identification !== undefined;
  },

  /**
   * Return the icon/label configuration for the identify toggle button using
   * pf2e's own Mystify / Identify iconography:
   *   Identified   → hollow circle-question (fa-regular) = "Mystify" action
   *   Unidentified → solid question-circle  (fa-solid)   = "Identify" action
   *
   * @param {boolean} isIdentified - Current identification state.
   * @returns {{ iconOn: string, iconFamilyOn: string, labelOnKey: string,
   *             iconOff: string, iconFamilyOff: string, labelOffKey: string }}
   */
  getIdentifyButtonConfig(_isIdentified) {
    return {
      // pf2e inventory row uses fa-regular fa-circle-question (Mystify) and
      // fa-solid fa-circle-question (Identify). Both use the same FA6 icon name;
      // only the weight (regular = outline, solid = filled) differs.
      iconOn: "fa-circle-question",
      iconFamilyOn: "fa-regular",
      labelOnKey: "PF2E.identification.Mystify",
      iconOff: "fa-circle-question",
      iconFamilyOff: "fa-solid",
      labelOffKey: "PF2E.identification.Identify"
    };
  },

  /**
   * Toggle identification on a pf2e item following pf2e's native inventory-row
   * behavior:
   *   Identified   → call `item.setIdentificationStatus("unidentified")` (Mystify).
   *   Unidentified → open `Pf2eIdentifyPopup` (the DC dialog), same as clicking
   *                  the toggle-identified button on a character sheet.
   *
   * @param {Item} item - The live embedded Item document to act on.
   * @returns {Promise<void>}
   */
  async performIdentifyToggle(item) {
    if (this.isItemIdentified(item)) {
      await item.setIdentificationStatus("unidentified");
    } else {
      new Pf2eIdentifyPopup(item).render(true);
    }
  }
};
