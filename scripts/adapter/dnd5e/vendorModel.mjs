const fields = foundry.data.fields;

/**
 * dnd5e-specific vendor data model. Extends dnd5e's NPC data model so the
 * reused inventory tab finds `system.currency` and `system.attributes.encumbrance`.
 * Registered by the dnd5e adapter in place of the system-agnostic base VendorModel.
 */
export default class Dnd5eVendorModel extends dnd5e.dataModels.actor.NPCData {

  static defineSchema() {
    return {
      ...super.defineSchema(),
      description: new fields.HTMLField({ required: false, initial: "" })
    };
  }

  prepareBaseData() {
    // `pick-up-stix.vendor`'s modelProvider is the module (resolved from the sub-type
    // namespace), so dnd5e's Actor5e.prepareData bails (`modelProvider !== dnd5e`) before
    // doing the per-cycle actor seeding it normally does ahead of preparing data:
    //   • `_clearCachedValues()` — builds the dnd5e-typed `identifiedItems` / `sourcedItems`
    //     maps. `sourcedItems` MUST be dnd5e's `SourcedItemsMap` (its `set` wraps values in a
    //     Set); a plain Map stores items unwrapped and breaks the NPC sheet drop handler's
    //     `sourcedItems.get(id)?.filter(...)` (consumable stacking).
    //   • `_preparationWarnings = []` — `prepareArmorClass` (run from NPCData.prepareDerivedData)
    //     pushes to it; undefined → crash.
    // Re-create that seeding here, in base-data order (before embedded docs + derived data run).
    this.parent._clearCachedValues();
    this.parent._preparationWarnings = [];
    this.parent.labels ??= {};
    super.prepareBaseData();
  }
}
