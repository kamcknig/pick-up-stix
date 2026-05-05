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
   * Translate a pf2e item changeset into the corresponding actor update so
   * the wrapping interactive actor stays the source of truth for both the
   * identified and mystified presentations.
   *
   * Three field categories are routed:
   *   1. Main sheet "Name" input (`_source.name`):
   *        identified   → actor.name
   *        unidentified → actor.system.unidentifiedName
   *   2. Mystification tab "Display Details" name input
   *      (`system.identification.unidentified.name`)
   *        → actor.system.unidentifiedName
   *   3. Mystification tab description editor
   *      (`system.identification.unidentified.data.description.value`)
   *        → actor.system.unidentifiedDescription
   *
   * Mystification-block changes are skipped when the changeset also
   * contains `system.identification.status` — that means the update
   * originates from `setIdentificationStatus` writing the auto-generated
   * `getMystifiedData("unidentified")` block, and we don't want to
   * persist pf2e's "Unusual {Type}" fallback as the actor's explicit
   * unidentified name.
   *
   * Returns `{}` when nothing needs to change so the caller can skip the
   * actor update (also avoids needless hook fan-out).
   */
  parseEmbeddedItemChanges(item, changes, actor) {
    const update = {};

    // 1. Main "Name" input.
    if ("name" in changes && typeof changes.name === "string") {
      const newName = changes.name;
      if (actor.system.isIdentified) {
        if (actor.name !== newName) update.name = newName;
      } else if (actor.system.unidentifiedName !== newName) {
        update["system.unidentifiedName"] = newName;
      }
    }

    // 2 & 3. Mystification tab name and description inputs — skip when
    //        status is also changing (setIdentificationStatus side effect).
    if (!foundry.utils.hasProperty(changes, "system.identification.status")) {
      const unidName = foundry.utils.getProperty(
        changes, "system.identification.unidentified.name"
      );
      if (typeof unidName === "string"
          && actor.system.unidentifiedName !== unidName) {
        update["system.unidentifiedName"] = unidName;
      }
      const unidDesc = foundry.utils.getProperty(
        changes, "system.identification.unidentified.data.description.value"
      );
      if (typeof unidDesc === "string"
          && actor.system.unidentifiedDescription !== unidDesc) {
        update["system.unidentifiedDescription"] = unidDesc;
      }
    }

    // 4. Main Description tab editor (system.description.value) — pf2e's
    //    prepareDerivedData overwrites this field with the active state's
    //    description, so an edit while mystified must route to the actor's
    //    unidentifiedDescription, not the canonical description.
    const descChange = foundry.utils.getProperty(changes, "system.description.value");
    if (typeof descChange === "string") {
      if (actor.system.isIdentified) {
        if (actor.system.description !== descChange) {
          update["system.description"] = descChange;
        }
      } else if (actor.system.unidentifiedDescription !== descChange) {
        update["system.unidentifiedDescription"] = descChange;
      }
    }

    return update;
  },

  buildEmbeddedItemSourceUpdate(actor, isIdentified) {
    const item = actor.system.embeddedItem;
    if (!item) return {};

    // Resolve the desired display name and description for the active state.
    // Names fall back through unidentifiedName → generateUnidentifiedName →
    // actor.name; descriptions fall back to empty.
    let desiredName, desiredDesc;
    if (isIdentified) {
      desiredName = actor.name;
      desiredDesc = actor.system.description ?? "";
    } else {
      desiredName = actor.system.unidentifiedName
        || (typeof item.generateUnidentifiedName === "function"
            ? item.generateUnidentifiedName()
            : "")
        || actor.name;
      desiredDesc = actor.system.unidentifiedDescription ?? "";
    }
    if (!desiredName) return {};

    // Mirror desired values into both _source (so the in-sheet inputs read
    // the right text) and the per-state caches. pf2e populates
    // `system.identification.identified` once via `??=` from the initial
    // source values, then reads `getMystifiedData(status)` in
    // `prepareDerivedData` to drive `this.name` and `this.system.description.value`.
    // Without updating the caches, a later identify cycle resurrects the
    // stale original name/description.
    const update = {};
    const src = item._source ?? {};

    if (src.name !== desiredName) update.name = desiredName;
    if ((src.system?.description?.value ?? "") !== desiredDesc) {
      update["system.description.value"] = desiredDesc;
    }

    const stateKey = isIdentified ? "identified" : "unidentified";
    const cacheNamePath = `system.identification.${stateKey}.name`;
    const cacheDescPath = `system.identification.${stateKey}.data.description.value`;
    if (foundry.utils.getProperty(src, cacheNamePath) !== desiredName) {
      update[cacheNamePath] = desiredName;
    }
    if ((foundry.utils.getProperty(src, cacheDescPath) ?? "") !== desiredDesc) {
      update[cacheDescPath] = desiredDesc;
    }

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
