import { updateItem, updateToken } from './mainEntry';
import { PICK_UP_STIX_MODULE_NAME } from './settings';

export class LootEmitLightConfigApplication extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ['pick-up-stix', 'loot-emit-light-config'],
      height: <string | undefined | null>'auto',
      width: 480,
      id: 'loot-emit-light-config',
      resizable: false,
      closeOnSubmit: false,
      submitOnChange: true,
      submitOnClose: true,
      minimizable: false,
      template: `/modules/${PICK_UP_STIX_MODULE_NAME}/templates/loot-emit-light-config.html`,
      title: 'Loot Light Emission',
    });
  }

  constructor(object, options) {
    super(object, options);
  }

  getData(options?): any {
    return {
      //@ts-ignore
      object: duplicate(this.object.data),
    };
  }

  async _updateObject(e, formData) {
    //@ts-ignore
    await updateToken(this.object.scene.id, {
      //@ts-ignore
      _id: <string>this.object.id,
      ...formData,
    });
  }
}
