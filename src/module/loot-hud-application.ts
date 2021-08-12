import { getLootToken } from "./mainEntry";
import { LootEmitLightConfigApplication } from "./loot-emit-light-config-application";
import { error, log } from '../main';
import { getGame, PICK_UP_STIX_FLAG, PICK_UP_STIX_ITEM_ID_FLAG, PICK_UP_STIX_MODULE_NAME, SettingKeys } from "./settings";

export class LootHud extends BasePlaceableHUD<Token> {

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      height: <string | null | undefined>'auto',
      minimizable: false,
      id: 'loot-hud',
      resizable: false,
      template: `/modules/${PICK_UP_STIX_MODULE_NAME}/templates/loot-hud.html`,
      classes: ['pick-up-stix', 'loot-hud'].concat(super.defaultOptions.classes)
    });
  }

  private get itemId(): string {
    return <string>this.object?.document.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_ITEM_ID_FLAG);
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
      ui.notifications?.error(`Invalid value '${val}'`);
      return;
    }

    if (val < 0) {
      ui.notifications?.error(`Minimum perceived value must be 0`);
      return;
    }

    this.object?.document.update({
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
    const lootToken = getLootToken({ itemId: this.itemId, tokenId: <string>this.object?.document.id })?.[0];

    if (!lootToken) {
      error(`No valid LootToken instance found for token '${<string>this.object?.document.id}' and Item id '${this.itemId}'`);
      return;
    }

    await lootToken.toggleLocked();
    this.render();
  }

  private onTokenConfig = async (event) => {
    log(` LootHud ${this.appId} | _onTokenConfig`);

    const item = <Item>getGame().items?.get(this.itemId);
    item.sheet?.render(true, { renderData: { sourceToken: this.object?.document.data._id }});
  }

  getData(options?: Application.RenderOptions) {
    log(` LootHud ${this.appId} | getData`);
    const lootData = getLootToken({ itemId: this.itemId, tokenId: <string>this.object?.document.id })?.[0];;
    if (!lootData) {
      //@ts-ignore
      error(`No valid LootToken instance found for token '${this.object?.document.id}' on scene '${this.object?.document.scene?.id}'`);
    }

    const data:any = {
      canConfigure: getGame().user?.can("TOKEN_CONFIGURE"),
      visibilityClass: this.object?.document.data.hidden ? 'active' : '',
      //@ts-ignore
      lockedClass: <string>this.object?.document.data.locked ? 'active' : '',
      showPerceiveInput: getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.enableLootTokenPerceiveReveal),
      minPerceiveValue: <number>(<any>this.object?.document.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG)).minPerceiveValue ?? getGame().settings.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.defaultMinimumPerceiveValue),
      id: this.id,
      classes: this.options.classes.join(" "),
      appId: this.appId,
      isGM: getGame().user?.isGM,
      icons: CONFIG.controlIcons
    };

    log([data]);
    return data;
  }
}
