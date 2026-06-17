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

  prepareDerivedData() {
    // `pick-up-stix.vendor`'s modelProvider is the module (resolved from the
    // sub-type namespace), so Actor5e.prepareData bails before _clearCachedValues
    // seeds these caches. NPCData.prepareDerivedData reads parent.identifiedItems,
    // so seed them defensively — idempotent if dnd5e already populated them.
    this.parent.identifiedItems ??= new Map();
    this.parent.sourcedItems ??= new Map();
    super.prepareDerivedData();
  }
}
