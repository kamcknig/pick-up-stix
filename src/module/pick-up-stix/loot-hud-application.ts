import { getLootToken } from "./main";
import { LootEmitLightConfigApplication } from "./loot-emit-light-config-application";

declare function fromUuid(uuid: string): Promise<Entity>;

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

  private get itemUuid(): string {
    return this.object.getFlag('pick-up-stix', 'pick-up-stix.itemUuid');
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
    html.find(".config").click(this.onTokenConfig);
    html.find(".locked").click(this._onToggleItemLocked);
    html.find(".emit-light").click(this.onConfigureLightEmission);
  }

  private onConfigureLightEmission = async (event) => {
    console.log(`pick-up-stix | LootHud ${this.appId} | _onConfigureLightEmission`);
    const f = new LootEmitLightConfigApplication(this.object, {}).render(true);
  }

  private _onToggleItemLocked = async (event) => {
    console.log(`pick-up-stix | LootHud ${this.appId} | _onToggleItemLocked`);
    const lootToken = getLootToken({ uuid: this.itemUuid, tokenId: this.object.id })?.[0];

    if (!lootToken) {
      console.error(`No valid LootToken instance found for token '${this.object.id}' and item uuid '${this.itemUuid}'`);
      return;
    }

    await lootToken.toggleLocked();
    this.render();
  }

  private onTokenConfig = async (event) => {
    console.log(`pick-up-stix | LootHud ${this.appId} | _onTokenConfig`);

    const item = await fromUuid(this.itemUuid);
    item.sheet.render(true);
  }

  getData(options) {
    console.log(`pick-up-stix | LootHud ${this.appId} | getData`);
    const lootData = getLootToken({ uuid: this.itemUuid, tokenId: this.object.id })?.[0];;
    if (!lootData) {
      console.error(`No valid LootToken instance found for token '${this.object.id}' on scene '${this.object.scene.id}'`);
    }

    const data = {
      canConfigure: game.user.can("TOKEN_CONFIGURE"),
      visibilityClass: this.object.data.hidden ? 'active' : '',
      lockedClass: this.object.getFlag('pick-up-stix', 'pick-up-stix')?.isLocked ? 'active' : '',
      id: this.id,
      classes: this.options.classes.join(" "),
      appId: this.appId,
      isGM: game.user.isGM,
      icons: CONFIG.controlIcons
    };

    console.log([data]);
    return data;
  }
}
