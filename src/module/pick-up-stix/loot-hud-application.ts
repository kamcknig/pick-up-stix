import ItemConfigApplication from "./item-config-application";
import { toggleItemLocked } from "./main";
import { LootEmitLightConfigApplication } from "./loot-emit-light-config-application";
import { ItemType } from "./models";

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
    const f = new LootEmitLightConfigApplication(this, {}).render(true);
  }

  private async _onToggleItemLocked(event) {
    console.log(`pick-up-stix | LootHud ${this.appId} | _onToggleItemLocked`);
    await toggleItemLocked.call(this, event);
    this.render();
  }

  private async _onTokenConfig(event) {
    console.log(`pick-up-stix | LootHud ${this.appId} | _onTokenConfig`);
    if (this.object.getFlag('pick-up-stix', 'pick-up-stix.itemType') === ItemType.CONTAINER) {
      new ItemConfigApplication(this.object as Token, this.object as Token).render(true);
      return;
    }

    const data = this.object.getFlag('pick-up-stix', 'pick-up-stix.itemData');

    const i = await Item.create(data, {submitOnChange: true});
    const app = i.sheet.render(true);

    const hook = Hooks.on('updateItem', async (item, data, options) => {
      console.log('pick-up-stix | loot-hud-application | _onTokenConfig | updateItem hook');
      if (data._id !== i.id) {
        return;
      }

      await this.object.setFlag('pick-up-stix', 'pick-up-stix.itemData', { ...item.data });
    });

    Hooks.once('closeItemSheet', async (sheet, html) => {
      console.log('pick-up-stix | loot-hud-application | _onTokenConfig | closeItemSheet hook');
      if (sheet.appId !== app.appId) {
        return;
      }

      await i.delete();
      Hooks.off('updateItem', hook as any);
    });
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
