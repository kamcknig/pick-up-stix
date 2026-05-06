/**
 * pf2e-compatible data model for the interactiveItem actor sub-type.
 *
 * Extends InteractiveItemModel with the minimum stub fields that pf2e's own
 * prepareBaseData chain reads before pick-up-stix has a chance to intervene:
 *
 *   ActorPF2e.prepareBaseData  → reads system.details.level.value, system.traits
 *   TokenDocumentPF2e.prepareBaseData → reads actor.system.details.alliance
 *
 * The remaining pf2e fields accessed in prepareBaseData are written transiently
 * by the pf2e chain itself and do not need schema entries:
 *   - LootPF2e.prepareBaseData writes system.attributes = {} before calling super
 *   - ActorPF2e.prepareBaseData writes system.autoChanges = {}
 *   - system.traits is accessed via traits?.size (optional chain, safe when absent)
 *
 * This model is registered on CONFIG.Actor.dataModels in place of the generic
 * InteractiveItemModel when the active game system is pf2e.
 */

import InteractiveItemModel from "../../models/InteractiveItemModel.mjs";

const fields = foundry.data.fields;

export default class Pf2eInteractiveItemModel extends InteractiveItemModel {

  static defineSchema() {
    return {
      ...super.defineSchema(),
      /**
       * Stub for pf2e's actor.system.details block.
       * ActorPF2e.prepareBaseData reads details.level.value (clamped to integer).
       * TokenDocumentPF2e.prepareBaseData reads details.alliance to set token
       * disposition (party→FRIENDLY, opposition→HOSTILE, null→NEUTRAL).
       */
      details: new fields.SchemaField({
        level: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 })
        }),
        alliance: new fields.StringField({ required: false, initial: null, nullable: true })
      })
    };
  }
}
