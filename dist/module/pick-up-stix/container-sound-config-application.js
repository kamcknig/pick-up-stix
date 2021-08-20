import { log } from "../../log.js";
import { updateItem } from "./main.js";
export class ContainerSoundConfig extends FormApplication {
    static get defaultOptions() {
        //@ts-ignore
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
        });
    }
    constructor(object, options) {
        super(object, options);
    }
    _openFilePicker(e) {
        new FilePicker({
            type: "audio",
            //@ts-ignore
            current: this.object.getFlag('pick-up-stix', `pick-up-stix.${e.currentTarget.dataset.edit}`),
            //@ts-ignore
            callback: (path) => {
                e.currentTarget.src = path;
                this._onSubmit(e);
            }
        });
    }
    async _updateObject(e, formData) {
        log(`pick-up-stix | ContainerSoundConfigApplication ${this.appId} | _updateObject`);
        log([formData]);
        //@ts-ignore
        const flags = duplicate(this.object.getFlag('pick-up-stix', 'pick-up-stix'));
        //@ts-ignore
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
        log(`pick-up-stix | ContainerSoundConfigApplication ${this.appId} | getData`);
        const data = {
            //@ts-ignore
            openSoundPath: this.object.getFlag('pick-up-stix', 'pick-up-stix.container.soundOpenPath') ?? '',
            //@ts-ignore
            closeSoundPath: this.object.getFlag('pick-up-stix', 'pick-up-stix.container.soundClosePath') ?? ''
        };
        log(data);
        return data;
    }
}

//# sourceMappingURL=../../maps/module/pick-up-stix/container-sound-config-application.js.map
