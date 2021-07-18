import { getLootToken } from "./mainEntry";
import { LootEmitLightConfigApplication } from "./loot-emit-light-config-application";
import { error, log } from '../main';
import { SettingKeys } from "./settings";

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
    log(` LootHud ${this.appId} | constructor called with args`);
    log(LootHud.defaultOptions);
  }

  activateListeners(html) {
    log(` LootHud ${this.appId} | activateListeners called with args`);
    log([html]);
    super.activateListeners(html);
    html.find(".config").click(this.onTokenConfig);
    html.find(".locked").click(this._onToggleItemLocked);
    html.find(".emit-light").click(this.onConfigureLightEmission);
    html.find(".visibility-perceive-input").on('change', this.onPerceiveValueChanged);
  }

  private onPerceiveValueChanged = (e) => {
    log(` LootHudApplication ${this.appId} | onPerceivedValueChanged`);
    const val = +e.currentTarget.value;
    log([val]);

    if (val === undefined || val === null || isNaN(val)) {
      ui.notifications.error(`Invalid value '${val}'`);
      return;
    }

    if (val < 0) {
      ui.notifications.error(`Minimum perceived value must be 0`);
      return;
    }

    this.object.update({
      flags: {
        'pick-up-stix': {
          'pick-up-stix': {
            minPerceiveValue: val
          }
        }
      }
    });
  }

  private onConfigureLightEmission = async (event) => {
    log(` LootHud ${this.appId} | _onConfigureLightEmission`);
    const f = new LootEmitLightConfigApplication(this.object, {}).render(true);
  }

  private _onToggleItemLocked = async (event) => {
    log(` LootHud ${this.appId} | _onToggleItemLocked`);
    const lootToken = getLootToken({ itemId: this.itemId, tokenId: this.object.id })?.[0];

    if (!lootToken) {
      error(`No valid LootToken instance found for token '${this.object.id}' and Item id '${this.itemId}'`);
      return;
    }

    await lootToken.toggleLocked();
    this.render();
  }

  private onTokenConfig = async (event) => {
    log(` LootHud ${this.appId} | _onTokenConfig`);

    const item = game.items.get(this.itemId);
    item.sheet.render(true, { renderData: { sourceToken: this.object.data._id }});
  }

  getData(options) {
    log(` LootHud ${this.appId} | getData`);
    const lootData = getLootToken({ itemId: this.itemId, tokenId: this.object.id })?.[0];;
    if (!lootData) {
      error(`No valid LootToken instance found for token '${this.object.id}' on scene '${this.object.scene.id}'`);
    }

    const data = {
      canConfigure: game.user.can("TOKEN_CONFIGURE"),
      visibilityClass: this.object.data.hidden ? 'active' : '',
      lockedClass: this.object.data.locked ? 'active' : '',
      showPerceiveInput: game.settings.get('pick-up-stix', SettingKeys.enableLootTokenPerceiveReveal),
      minPerceiveValue: this.object.getFlag('pick-up-stix', 'pick-up-stix.minPerceiveValue') ?? game.settings.get('pick-up-stix', SettingKeys.defaultMinimumPerceiveValue),
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
