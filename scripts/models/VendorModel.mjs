const { TypeDataModel } = foundry.abstract;
const fields = foundry.data.fields;

/**
 * Data model for the `pick-up-stix.vendor` actor sub-type.
 *
 * Intentionally minimal for the initial rendering milestone — only the fields
 * the vendor sheet currently displays. Vendor-specific fields (wares, pricing,
 * currency, etc.) will be added alongside the corresponding sheet tabs.
 *
 * Kept system-agnostic: a future pf2e adapter overrides this entry with a
 * stubbed subclass (mirroring Pf2eInteractiveItemModel), so do not add
 * system-specific fields here.
 */
export default class VendorModel extends TypeDataModel {

  static LOCALIZATION_PREFIXES = ["INTERACTIVE_ITEMS.Vendor"];

  static defineSchema() {
    return {
      description: new fields.HTMLField({ required: false, initial: "" })
    };
  }
}
