import VendorModel from "../../models/VendorModel.mjs";

const fields = foundry.data.fields;

/**
 * pf2e-compatible data model for the `pick-up-stix.vendor` actor sub-type.
 *
 * Mirrors Pf2eInteractiveItemModel: extends the system-agnostic base
 * VendorModel and adds the stub fields pf2e's prepareBaseData chain reads
 * before the module can intervene:
 *   ActorPF2e.prepareBaseData         → system.details.level.value
 *   TokenDocumentPF2e.prepareBaseData → system.details.alliance
 *   LootPF2e.isMerchant / isLoot      → system.lootSheetType
 *
 * The actor document class is LootPF2e (registered in the pf2e adapter
 * constructor), but `actor.system` is THIS model — the two registries are
 * independent, exactly as for interactiveItem. Registered on
 * CONFIG.Actor.dataModels in place of the base VendorModel by the pf2e adapter
 * constructor.
 */
export default class Pf2eVendorModel extends VendorModel {

  static defineSchema() {
    return {
      ...super.defineSchema(),
      /**
       * Stub for pf2e's actor.system.details block (cf. Pf2eInteractiveItemModel).
       * ActorPF2e.prepareBaseData reads details.level.value (clamped integer);
       * TokenDocumentPF2e.prepareBaseData reads details.alliance for disposition.
       */
      details: new fields.SchemaField({
        level: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 })
        }),
        alliance: new fields.StringField({ required: false, initial: null, nullable: true })
      }),
      /**
       * LootPF2e.isMerchant reads system.lootSheetType. We render our own sheet
       * (never LootSheetPF2e), so the value is cosmetic, but "Merchant" keeps the
       * actor self-coherent as a shop.
       */
      lootSheetType: new fields.StringField({ required: false, initial: "Merchant" })
    };
  }
}
