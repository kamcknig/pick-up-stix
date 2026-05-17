/**
 * InteractiveLightConfig — ApplicationV2 form for editing an interactive actor's
 * emitted-light data. Reuses Foundry's stock `templates/scene/token/light.hbs`
 * template so the UI matches the Token Light tab across v13 and v14. The template
 * already exposes dim/bright/color/animation/advanced fields via `lightFields`
 * (a `foundry.data.LightData` schema slice) and `source.light.*` bindings, giving
 * us v14's `priority` field automatically without any version-gating.
 *
 * The form auto-submits on every change (`submitOnChange: true`) so the GM sees
 * live feedback on the actor. Per-actor singleton cache mirrors the pattern used by
 * `Dnd5eInteractiveItemConfigSheet.forActor`.
 */

import { getAdapter } from "../adapter/index.mjs";
import { dbg } from "../utils/debugLog.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * GM-only light-emission editor for a `pick-up-stix.interactiveItem` actor.
 *
 * Opens via the lightbulb header button (Phase 3). Persists changes through
 * `adapter.setInteractiveLightData` so dnd5e, pf2e, and generic actors are all
 * covered without branching.
 */
export default class InteractiveLightConfig extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @type {Map<string, InteractiveLightConfig>} Per-actor singleton cache keyed by actor UUID. */
  static #instances = new Map();

  /**
   * Resolve the light-config sheet for a given actor, creating a new instance on
   * first call and returning the cached instance on subsequent calls.
   *
   * @param {Actor} actor
   * @returns {InteractiveLightConfig}
   */
  static forActor(actor) {
    const key = actor.uuid;
    let sheet = InteractiveLightConfig.#instances.get(key);
    if (!sheet) {
      sheet = new InteractiveLightConfig({ actor });
      InteractiveLightConfig.#instances.set(key, sheet);
    }
    return sheet;
  }

  /**
   * @param {object} options
   * @param {Actor} options.actor - The interactive actor whose light this form edits.
   */
  constructor(options = {}) {
    super(options);
    /** @type {Actor} */
    this.actor = options.actor;
  }

  static DEFAULT_OPTIONS = {
    classes: ["pick-up-stix", "interactive-light-config", "standard-form"],
    position: { width: 520, height: "auto" },
    window: {
      contentClasses: ["standard-form"],
      resizable: true,
      icon: "fa-solid fa-lightbulb"
    },
    form: {
      handler: InteractiveLightConfig.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false
    },
    tag: "form"
  };

  /**
   * Reuse Foundry's stock token light template. It expects `source.light.*`,
   * `lightFields`, `lightAnimations`, `colorationTechniques`, `gridUnits`,
   * `rootId`, and `tab` — all prepared in `_prepareContext`.
   */
  static PARTS = {
    light: { template: "templates/scene/token/light.hbs" }
  };

  /** @override */
  get title() {
    return `${game.i18n.localize("INTERACTIVE_ITEMS.Light.Title")}: ${this.actor.name}`;
  }

  /** @override */
  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const adapter = getAdapter();
    const { light } = adapter.getInteractiveLightData(this.actor);

    // The token light.hbs template references source.light.* and lightFields.*.
    // Crucially, lightFields MUST come from TokenDocument's embedded copy (where
    // each sub-field's `fieldPath` is "light.dim", "light.bright", …). The base
    // `foundry.data.LightData.schema.fields.*` has fieldPath "dim", "bright" with
    // no "light." prefix, so {{formInput}} would emit `<input name="dim">` and
    // the submitted formData wouldn't nest under `light` — `expanded.light` would
    // be empty and nothing would persist. Pulling from BaseToken's localized
    // embedded copy gives both the correct fieldPath AND the localized labels.
    ctx.rootId = this.id;
    ctx.source = { light };
    ctx.lightFields = foundry.documents.BaseToken.schema.fields.light.fields;

    // Use only light animations (not darkness animations) since interactive items
    // are not expected to be darkness sources in the typical workflow.
    ctx.lightAnimations = CONFIG.Canvas.lightAnimations;

    // AdaptiveLightingShader lives at the same path on both v13 and v14; the
    // SHADER_TECHNIQUES property powers the coloration select choices.
    ctx.colorationTechniques =
      foundry.canvas?.rendering?.shaders?.AdaptiveLightingShader?.SHADER_TECHNIQUES ?? {};

    ctx.gridUnits = canvas.scene?.grid?.units || game.i18n.localize("GridUnits");

    // The token/light.hbs template wraps its content in a `<div class="tab ...">` that
    // reads tab.active, tab.group, and tab.id. We render this as a standalone form
    // with no tab navigation, so we supply a stub that keeps the wrapper always active.
    ctx.tab = { active: true, group: "light", id: "light" };

    return ctx;
  }

  /**
   * Form-change handler. Expands the flat form data into a nested object and
   * persists it via the adapter so model-backed (dnd5e, pf2e) and flag-backed
   * (generic) actors are both handled transparently.
   *
   * @param {Event} event
   * @param {HTMLFormElement} form
   * @param {import("@common/ux/form-data-extended.mjs").FormDataExtended} formData
   * @this {InteractiveLightConfig}
   */
  static async #onSubmit(event, form, formData) {
    const adapter = getAdapter();
    const expanded = foundry.utils.expandObject(formData.object);
    const newLight = expanded.light ?? {};
    const { light: oldLight } = adapter.getInteractiveLightData(this.actor);

    const oldHasRadii = !!oldLight
      && ((oldLight.dim ?? 0) > 0 || (oldLight.bright ?? 0) > 0);
    const newHasRadii = (newLight.dim ?? 0) > 0 || (newLight.bright ?? 0) > 0;

    // Auto-couple lightActive to radii TRANSITIONS so the GM doesn't have to
    // touch a separate toggle when configuring a torch for the first time:
    //   - going from "no radii" to "any radii" → turn light on (active=true)
    //   - going from "any radii" to "no radii" → turn light off (active=false)
    //   - other edits (e.g. color, animation, radii adjustments while already on)
    //     leave the explicit on/off state alone so a player's row-icon toggle
    //     is not silently reversed by an unrelated GM edit.
    const partial = { light: newLight };
    if (newHasRadii && !oldHasRadii) partial.active = true;
    else if (!newHasRadii && oldHasRadii) partial.active = false;

    dbg("light-config:submit", {
      actorId: this.actor.id,
      lightKeys: Object.keys(newLight),
      oldHasRadii, newHasRadii,
      activeChange: partial.active
    });

    await adapter.setInteractiveLightData(this.actor, partial);
  }

  /** @override */
  async close(options = {}) {
    dbg("light-config:close", { actorId: this.actor?.id });
    InteractiveLightConfig.#instances.delete(this.actor?.uuid);
    return super.close(options);
  }
}
