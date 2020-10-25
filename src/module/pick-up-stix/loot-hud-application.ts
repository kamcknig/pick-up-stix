import { getLootToken } from "./main";
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
    console.log([html]);
    super.activateListeners(html);
    html.find(".config").click(this._onTokenConfig);
    html.find(".locked").click(this._onToggleItemLocked);
    html.find(".emit-light").click(this._onConfigureLightEmission);
  }

  private _onConfigureLightEmission = async (event) => {
    console.log(`pick-up-stix | LootHud ${this.appId} | _onConfigureLightEmission`);
    // TODO: look into this
    const f = new LootEmitLightConfigApplication(this.object, {}).render(true);
  }

  private _onToggleItemLocked = async (event) => {
    console.log(`pick-up-stix | LootHud ${this.appId} | _onToggleItemLocked`);
    const lootToken = getLootToken(this.object.scene.id, this.object.id);

    if (!lootToken) {
      console.error(`No valid LootToken instance found for token '${this.object.id}' on scene '${this.object.scene.id}'`);
      return;
    }

    await lootToken.toggleLocked();
    this.render();
  }

  private _onTokenConfig = async (event) => {
    console.log(`pick-up-stix | LootHud ${this.appId} | _onTokenConfig`);

    const lootToken = getLootToken(canvas.scene.id, this.object.id);
    lootToken?.openConfigSheet();
  }

  getData(options) {
    console.log(`pick-up-stix | LootHud ${this.appId} | getData`);
    const data = super.getData();

    const lootData = getLootToken(this.object.scene.id, this.object.id);
    if (!lootData) {
      console.error(`No valid LootToken instance found for token '${this.object.id}' on scene '${this.object.scene.id}'`);
    }

    return mergeObject(data, {
      canConfigure: game.user.can("TOKEN_CONFIGURE"),
      visibilityClass: data.hidden ? 'active' : '',
      lockedClass: lootData.isLocked ? 'active' : ''
    });
  }
}
