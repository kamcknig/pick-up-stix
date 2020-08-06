import { ItemType } from "./models";

export default class ItemTypeSelectionApplication extends FormApplication {
  static get defaultOptions(): FormApplicationOptions {
    return mergeObject(super.defaultOptions, {
      submitOnClose: true,
      height: 'auto',
      id: 'loot-type-selection-form',
      minimizable: false,
      resizable: false,
      template: 'modules/pick-up-stix/module/pick-up-stix/templates/item-type-selection.html',
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
    setProperty(formData, 'flags.pick-up-stix.pick-up-stix.itemType', formData.itemType);

    if (formData.itemType === ItemType.CONTAINER) {
      setProperty(formData, 'flags.pick-up-stix.pick-up-stix.imageContainerClosedPath', 'modules/pick-up-stix/assets/chest-closed.png');
      setProperty(formData, 'flags.pick-up-stix.pick-up-stix.imageContainerOpenPath', 'modules/pick-up-stix/assets/chest-opened.png');
      setProperty(formData, 'img', 'modules/pick-up-stix/assets/chest-closed.png');
    }

    setProperty(formData, 'flags.pick-up-stix.pick-up-stix.isLocked', formData.isLocked);
    return this.object.update(formData);
  }
}
