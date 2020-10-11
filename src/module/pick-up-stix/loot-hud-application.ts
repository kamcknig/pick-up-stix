import { getLootToken, toggleItemLocked } from "./main";
import { LootEmitLightConfigApplication } from "./loot-emit-light-config-application";

export class LootHud extends BasePlaceableHUD {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      height: 'auto',
      minimizable: false,
      id: 'loot-hud',
      resizable: false,
      template: 'modules/pick-up-stix/module/pick-up-stix/templates/loot-hud.html',
      classes: ['pick-up-stix', 'loot-hud'].concat(super.defaultOptions.classes)
    });
  }

  constructor() {
    super({});
    console.log(`pick-up-stix | LootHud ${this.appId} | constructor called with args`);
    console.log(LootHud.defaultOptions);
  }

  activateListeners(html) {
    console.log(`pick-up-stix | LootHud ${this.appId} | activateListeners called with args`);
    console.log(html);
    super.activateListeners(html);
    html.find(".config").click(this._onTokenConfig.bind(this));
    html.find(".locked").click(this._onToggleItemLocked.bind(this.object));
    html.find(".emit-light").click(this._onConfigureLightEmission.bind(this.object));
  }

  private async _onConfigureLightEmission(event) {
    console.log(`pick-up-stix | LootHud ${this.appId} | _onConfigureLightEmission`);
    // TODO: look into this
    const f = new LootEmitLightConfigApplication(this, {}).render(true);
  }

  private async _onToggleItemLocked(event) {
    console.log(`pick-up-stix | LootHud ${this.appId} | _onToggleItemLocked`);
    // TODO: look into this
    await toggleItemLocked.call(this, event);
    this.render();
  }

  private async _onTokenConfig(event) {
    console.log(`pick-up-stix | LootHud ${this.appId} | _onTokenConfig`);

    const lootToken = getLootToken(canvas.scene.id, this.object.id);
    lootToken?.openConfigSheet();
  }

  getData(options) {
    console.log(`pick-up-stix | LootHud ${this.appId} | getData`);
    const data = super.getData();
    return mergeObject(data, {
      canConfigure: game.user.can("TOKEN_CONFIGURE"),
      visibilityClass: data.hidden ? 'active' : '',
      lockedClass: this.object.getFlag('pick-up-stix', 'pick-up-stix.isLocked') ? 'active' : ''
    });
  }
}
