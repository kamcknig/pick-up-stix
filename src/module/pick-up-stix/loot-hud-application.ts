import ItemConfigApplication from "./item-config-application";
import { toggleItemLocked } from "./main";

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
    console.log(`pick-up-stix | LootHud | constructor called with args`);
    console.log(LootHud.defaultOptions);
  }

  activateListeners(html) {
    console.log(`pick-up-stix | LootHud | activateListeners called with args`);
    console.log(html);
    super.activateListeners(html);
    html.find(".config").click(this._onTokenConfig.bind(this.object));
    html.find(".locked").click(this._onToggleItemLocked.bind(this.object));
  }

  private async _onToggleItemLocked(event) {
    await toggleItemLocked.call(this, event);
    this.render();
  }

  private _onTokenConfig(event) {
    const f = new ItemConfigApplication((this as any), (this as any)).render(true);
  }

  getData(options) {
    const data = super.getData();
    return mergeObject(data, {
      canConfigure: game.user.can("TOKEN_CONFIGURE"),
      visibilityClass: data.hidden ? 'active' : '',
      lockedClass: this.object.getFlag('pick-up-stix', 'pick-up-stix.isLocked') ? 'active' : ''
    });
  }
}
