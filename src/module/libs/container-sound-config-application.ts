import { log } from '../../main';
import { ItemFlags } from '../loot-token';
import { updateItem } from '../mainEntry';
import { PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME } from '../settings';

export class ContainerSoundConfig extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ['pick-up-stix', 'container-sound-config-sheet'],
      closeOnSubmit: false,
      height: <string | undefined | null>'auto',
      id: 'pick-up-stix-container-config-sheet',
      minimizable: false,
      resizable: false,
      submitOnChange: true,
      submitOnClose: true,
      width: 350,
      template: `/modules/${PICK_UP_STIX_MODULE_NAME}/templates/container-sound-config.html`,
      title: 'Configure Container Sounds',
    });
  }

  constructor(object, options) {
    super(object, options);
  }

  protected _openFilePicker(e): void {
    new FilePicker({
      type: 'audio',
      current: <string>(
        (<Item>this.object).getFlag(PICK_UP_STIX_MODULE_NAME, `${PICK_UP_STIX_FLAG}.${e.currentTarget.dataset.edit}`)
      ),
      callback: (path) => {
        e.currentTarget.src = path;
        this._onSubmit(e);
      },
    });
  }

  async _updateObject(e, formData) {
    log(` ContainerSoundConfigApplication ${this.appId} | _updateObject`);
    log([formData]);

    const flags: ItemFlags = <ItemFlags>(
      duplicate((<Item>this.object).getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG))
    );

    await updateItem((<Item>this.object).id, {
      flags: {
        'pick-up-stix': {
          'pick-up-stix': {
            container: {
              ...formData,
            },
          },
        },
      },
    });
  }

  getData(options) {
    log(` ContainerSoundConfigApplication ${this.appId} | getData`);
    const data = {
      openSoundPath:
        (<ItemFlags>(<Item>this.object).getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG)).container
          ?.soundOpenPath ?? '',
      closeSoundPath:
        (<ItemFlags>(<Item>this.object).getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG)).container
          ?.soundClosePath ?? '',
    };
    log(data);
    return <any>data;
  }
}
