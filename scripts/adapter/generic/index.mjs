import SystemAdapter from "../SystemAdapter.mjs";
import { GenericData } from "./data.mjs";
import { GenericIdentification } from "./identification.mjs";
import { GenericContainer } from "./container.mjs";
import { GenericSheets } from "./sheets.mjs";
import { GenericHooks } from "./hooks.mjs";

const MODULE_ID = "pick-up-stix";

/**
 * Fallback SystemAdapter for systems without a dedicated pick-up-stix adapter.
 *
 * Diverges from the dnd5e/pf2e adapters at the data layer: every
 * interactive-object property lives in `flags["pick-up-stix"].interactive.*`,
 * the actor's `system` data is never read, and `actor.items` is never used.
 * The custom sheets in `./configSheet.mjs`, `./itemView.mjs`, and
 * `./containerView.mjs` render entirely from flag data.
 *
 * `containerItemType` and `defaultLootItemType` are defined directly on the
 * class (not mixed in via Object.assign) because Object.assign invokes getter
 * accessors at copy time, which would capture the wrong `this` context.
 */
export default class GenericAdapter extends SystemAdapter {
  static SYSTEM_ID = "generic";

  capabilities = {
    hasUnidentifiedItemImage: false,
    hasItemDropSheetHook: false,
    hasItemContextMenuHook: false,
    hasNativeContainerWindow: false,
    hasNativeDeepCreate: false,
    hasNativeInventoryIdentify: false,
    supportsIdentification: false
  };

  get cssClasses() {
    return {
      stateToggle: "header-control",
      configButton: "header-control",
      rowControl: "",
      headerElementType: "button"
    };
  }

  get nativeIdentifyHeaderSelector() {
    return null;
  }

  /**
   * Unused on the generic path — we never create system items for containers.
   *
   * @returns {string}
   */
  get containerItemType() {
    return "";
  }

  /**
   * The item type used when creating a pickup stub in a player's inventory
   * (Phase 7). Read from a world setting populated by a heuristic + dialog.
   *
   * @returns {string}
   */
  get defaultLootItemType() {
    try {
      return game.settings.get(MODULE_ID, "genericPickupItemType") || "";
    } catch {
      return "";
    }
  }
}

Object.assign(GenericAdapter.prototype, GenericData);
Object.assign(GenericAdapter.prototype, GenericIdentification);
Object.assign(GenericAdapter.prototype, GenericContainer);
Object.assign(GenericAdapter.prototype, GenericSheets);
Object.assign(GenericAdapter.prototype, GenericHooks);
