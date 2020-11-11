import { getLootToken } from "./main";
import { LootEmitLightConfigApplication } from "./loot-emit-light-config-application";
import { error, log } from "../../log";

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

  private get itemId(): string {
    return this.object.getFlag('pick-up-stix', 'pick-up-stix.itemId');
  }

  constructor() {
    super({});
    log(`pick-up-stix | LootHud ${this.appId} | constructor called with args`);
    log(LootHud.defaultOptions);
  }

  activateListeners(html) {
    log(`pick-up-stix | LootHud ${this.appId} | activateListeners called with args`);
    log([html]);
    super.activateListeners(html);
    html.find(".config").click(this.onTokenConfig);
    html.find(".locked").click(this._onToggleItemLocked);
    html.find(".emit-light").click(this.onConfigureLightEmission);
  }

  private onConfigureLightEmission = async (event) => {
    log(`pick-up-stix | LootHud ${this.appId} | _onConfigureLightEmission`);
    const f = new LootEmitLightConfigApplication(this.object, {}).render(true);
  }

  private _onToggleItemLocked = async (event) => {
    log(`pick-up-stix | LootHud ${this.appId} | _onToggleItemLocked`);
    const lootToken = getLootToken({ itemId: this.itemId, tokenId: this.object.id })?.[0];

    if (!lootToken) {
      error(`No valid LootToken instance found for token '${this.object.id}' and Item id '${this.itemId}'`);
      return;
    }

    await lootToken.toggleLocked();
    this.render();
  }

  private onTokenConfig = async (event) => {
    log(`pick-up-stix | LootHud ${this.appId} | _onTokenConfig`);

    const item = game.items.get(this.itemId);
    item.sheet.render(true, { renderData: { sourceToken: this.object.data._id }});
  }

  getData(options) {
    log(`pick-up-stix | LootHud ${this.appId} | getData`);
    const lootData = getLootToken({ itemId: this.itemId, tokenId: this.object.id })?.[0];;
    if (!lootData) {
      error(`No valid LootToken instance found for token '${this.object.id}' on scene '${this.object.scene.id}'`);
    }

    const data = {
      canConfigure: game.user.can("TOKEN_CONFIGURE"),
      visibilityClass: this.object.data.hidden ? 'active' : '',
      lockedClass: this.object.data.locked ? 'active' : '',
      id: this.id,
      classes: this.options.classes.join(" "),
      appId: this.appId,
      isGM: game.user.isGM,
      icons: CONFIG.controlIcons
    };

    log([data]);
    return data;
  }
}
