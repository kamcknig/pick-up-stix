/**
 * Replicates pf2e's native IdentifyItemPopup using the same template and DC
 * formula. IdentifyItemPopup is module-scoped inside pf2e.mjs and not exported,
 * so we construct an equivalent FormApplication that produces an identical UX.
 *
 * DC table and rarity adjustments copied verbatim from pf2e 8.x source
 * (pf2e.mjs dcByLevel / dcAdjustments). These are fixed game-rule constants
 * published in the PF2e CRB, so embedding them here is safe against pf2e
 * version drift.
 */

// Level → base DC lookup (Pathfinder 2e CRB p.503).
const DC_BY_LEVEL = new Map([
  [-1, 13], [0, 14], [1, 15], [2, 16], [3, 18], [4, 19], [5, 20],
  [6, 22], [7, 23], [8, 24], [9, 26], [10, 27], [11, 28], [12, 30],
  [13, 31], [14, 32], [15, 34], [16, 35], [17, 36], [18, 38],
  [19, 39], [20, 40], [21, 42], [22, 44], [23, 46], [24, 48], [25, 50]
]);

const DC_ADJUSTMENT = new Map([
  ["incredibly-easy", -10], ["very-easy", -5], ["easy", -2],
  ["normal", 0], ["hard", 2], ["very-hard", 5], ["incredibly-hard", 10]
]);

const MAGIC_TRADITIONS = new Set(["arcane", "divine", "occult", "primal"]);

/**
 * Compute per-skill identification DCs for `item`, replicating pf2e's
 * module-scoped `getItemIdentificationDCs` helper exactly.
 *
 * @param {Item} item - A pf2e physical item document.
 * @returns {{ arcana?: number, nature?: number, religion?: number, occultism?: number, crafting?: number }}
 */
function _computeItemDCs(item) {
  const pwol = game.pf2e.settings.variants.pwol.enabled;
  const level = item.level ?? 0;
  const baseDC = DC_BY_LEVEL.get(level) ?? 14;
  const dcNoRarity = pwol ? baseDC - Math.max(level, 0) : baseDC;

  // Cursed items use "unique" rarity for the DC calculation.
  const rarity = item.traits?.has?.("cursed") ? "unique" : (item.rarity ?? "common");
  const rarityKey = rarity === "uncommon" ? "hard"
    : rarity === "rare" ? "very-hard"
      : rarity === "unique" ? "incredibly-hard"
        : "normal";
  const dc = dcNoRarity + (DC_ADJUSTMENT.get(rarityKey) ?? 0);

  if (!item.isMagical) return { crafting: dc };

  const notMatchingMod = Number(
    game.settings.get("pf2e", "identifyMagicNotMatchingTraditionModifier")
  ) || 5;
  const traditions = new Set(
    (item.system?.traits?.value ?? []).filter(t => MAGIC_TRADITIONS.has(t))
  );
  const raw = { arcane: dc, divine: dc, occult: dc, primal: dc };
  for (const trad of MAGIC_TRADITIONS) {
    if (traditions.size > 0 && !traditions.has(trad)) raw[trad] += notMatchingMod;
  }
  return {
    arcana: raw.arcane,
    nature: raw.primal,
    religion: raw.divine,
    occultism: raw.occult
  };
}

/**
 * Dialog shown when a GM clicks the Identify button on an unidentified pf2e
 * item. Renders pf2e's own identify-item.hbs template with calculated DCs and
 * wires up the "Post to Chat" and "Identify" buttons.
 */
export class Pf2eIdentifyPopup extends foundry.appv1.api.FormApplication {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "identify-item",
      title: game.i18n.localize("PF2E.identification.Identify"),
      template: "systems/pf2e/templates/actors/identify-item.hbs",
      width: "auto",
      classes: ["identify-popup"]
    });
  }

  // Class field runs after FormApplication sets this.object in its constructor.
  dcs = _computeItemDCs(this.object);

  /** @override */
  async getData() {
    const item = this.object;
    return {
      ...await super.getData(),
      isMagic: item.isMagical,
      isAlchemical: item.isAlchemical,
      dcs: this.dcs
    };
  }

  /** @override */
  activateListeners($html) {
    super.activateListeners($html);
    const html = $html[0];

    html.querySelector("button.update-identification")?.addEventListener("click", (ev) => {
      const btn = ev.currentTarget;
      this.submit({ updateData: { status: btn.value } });
    });

    html.querySelector("button.post-skill-checks")?.addEventListener("click", async () => {
      const item = this.object;
      const action = item.isMagical ? "identify-magic"
        : item.isAlchemical ? "identify-alchemy"
          : "recall-knowledge";
      const content = await foundry.applications.handlebars.renderTemplate(
        "systems/pf2e/templates/actors/identify-item-chat-skill-checks.hbs",
        {
          identifiedName: item.system.identification.identified.name,
          action,
          skills: this.dcs,
          unidentified: item.system.identification.unidentified,
          uuid: item.uuid
        }
      );
      await ChatMessage.implementation.create({ author: game.user.id, content });
    });
  }

  /** @override */
  async _updateObject(_event, formData) {
    if (formData.status === "identified") {
      return this.object.setIdentificationStatus("identified");
    }
  }
}
