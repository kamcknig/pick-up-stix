import { updateItem, updateToken } from "./main";

export class LootEmitLightConfigApplication extends FormApplication {
  static get defaultOptions() {
    //@ts-ignore
    return mergeObject(super.defaultOptions, {
      classes: ['pick-up-stix', 'loot-emit-light-config'],
      height: 'auto',
      width: 480,
      id: 'loot-emit-light-config',
      resizable: false,
      closeOnSubmit: false,
      submitOnChange: true,
      submitOnClose: true,
      minimizable: false,
      template: 'modules/pick-up-stix/module/pick-up-stix/templates/loot-emit-light-config.html',
      title: 'Loot Light Emission'
    });
  }

  constructor(object, options) {
    super(object, options);
  }

  getData(options):any {
    return {
      //@ts-ignore
      object: duplicate(this.object.data)
    };
  }

  async _updateObject(e, formData) {
    //@ts-ignore
    await updateToken(this.object.scene.id, {
      //@ts-ignore
      _id: this.object.id,
      ...formData
    });
  }
}
