import { ItemType } from "./models";

export default class LootTypeSelectionApplication extends FormApplication {
  static get defaultOptions(): FormApplicationOptions {
    return mergeObject(super.defaultOptions, {
      submitOnClose: true,
      height: 'auto',
      id: 'loot-type-selection-form',
      minimizable: false,
      resizable: false,
      template: 'modules/pick-up-stix/module/pick-up-stix/templates/loot-type-selection.html',
      title: 'Select Loot Type'
    });
  }

  constructor(object, options = {}) {
    super(object, options);
    console.log(`pick-up-stix | LootTypeSelectionApplication | constructed with args:`);
    console.log([object, options]);
  }

  getData() {
    const data = {
      lootTypes: Object.values(ItemType)
    }
    console.log(`pick-up-stix | LootTypeSelectionApplication | getData:`);
    console.log(data);
    return data;
  }

  async _updateObject(event, formData): Promise<Entity> {
    console.log(`pick-up-stix | LootTypeSelectionApplication | _updateObject called with args:`);
    console.log([event, formData]);
    formData._id = this.object._id;
    setProperty(formData, 'flags.pick-up-stix.pick-up-stix.itemType', formData.itemType)
    setProperty(formData, 'flags.pick-up-stix.pick-up-stix.isLocked', formData.isLocked);
    return this.object.update(formData);
  }
}
