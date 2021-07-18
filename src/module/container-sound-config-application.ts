import { log } from '../main';
import { ItemFlags } from "./loot-token";
import { updateItem } from "./mainEntry";

export class ContainerSoundConfig extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ['pick-up-stix', 'container-sound-config-sheet'],
      closeOnSubmit: false,
      height: 'auto',
      id: 'pick-up-stix-container-config-sheet',
      minimizable: false,
      resizable: false,
      submitOnChange: true,
      submitOnClose: true,
      width: 350,
      template: 'modules/pick-up-stix/module/pick-up-stix/templates/container-sound-config.html',
      title: 'Configure Container Sounds'
    })
  }

  constructor(object, options) {
    super(object, options);
  }

  protected _openFilePicker(e): void {
    new FilePicker({
      type: "audio",
      current: this.object.getFlag('pick-up-sitx', `pick-up-stix.${e.currentTarget.dataset.edit}`),
      callback: path => {
        e.currentTarget.src = path;
        this._onSubmit(e);
      }
    })
  }

  async _updateObject(e, formData) {
    log(` ContainerSoundConfigApplication ${this.appId} | _updateObject`);
    log([formData]);

    const flags: ItemFlags = duplicate(this.object.getFlag('pick-up-stix', 'pick-up-stix'));

    await updateItem(this.object.id, {
      flags: {
        'pick-up-stix': {
          'pick-up-stix': {
            container: {
              ...formData
            }
          }
        }
      }
    });
  }

  getData(options) {
    log(` ContainerSoundConfigApplication ${this.appId} | getData`);
    const data = {
      openSoundPath: this.object.getFlag('pick-up-stix', 'pick-up-stix.container.soundOpenPath') ?? '',
      closeSoundPath: this.object.getFlag('pick-up-stix', 'pick-up-stix.container.soundClosePath') ?? ''
    }
    log(data);
    return data;
  }
}
