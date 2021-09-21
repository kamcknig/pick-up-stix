import { log } from "../main.js";
import { updateItem } from "./mainEntry.js";
import { PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME } from "./settings.js";
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
            template: `/modules/${PICK_UP_STIX_MODULE_NAME}/templates/container-sound-config.html`,
            title: 'Configure Container Sounds',
        });
    }
    constructor(object, options) {
        super(object, options);
    }
    _openFilePicker(e) {
        new FilePicker({
            type: 'audio',
            current: (this.object.getFlag(PICK_UP_STIX_MODULE_NAME, `pick-up-stix.${e.currentTarget.dataset.edit}`)),
            callback: (path) => {
                e.currentTarget.src = path;
                this._onSubmit(e);
            },
        });
    }
    async _updateObject(e, formData) {
        log(` ContainerSoundConfigApplication ${this.appId} | _updateObject`);
        log([formData]);
        const flags = (duplicate(this.object.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG)));
        await updateItem(this.object.id, {
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
            openSoundPath: this.object.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG).container
                ?.soundOpenPath ?? '',
            closeSoundPath: this.object.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG).container
                ?.soundClosePath ?? '',
        };
        log(data);
        return data;
    }
}
