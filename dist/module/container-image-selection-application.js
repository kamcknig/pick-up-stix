import { log } from "../main.js";
import { updateItem } from "./mainEntry.js";
import { PICK_UP_STIX_MODULE_NAME } from "./settings.js";
/**
 * Application class to display to select an item that the token is
 * associated with
 */
export default class ContainerImageSelectionApplication extends FormApplication {
    constructor(_item) {
        super(_item);
        this._item = _item;
        this._onClickImage = (e) => {
            const attr = e.currentTarget.dataset.edit;
            const current = getProperty(this._item.data, `flags.pick-up-stix.pick-up-stix.${attr}`);
            new FilePicker({
                type: 'image',
                current,
                callback: (path) => {
                    e.currentTarget.src = path;
                    this._onSubmit(e);
                },
                top: this.position.top + 40,
                left: this.position.left + 10,
            }).browse(current);
        };
        log(` ContainerImageSelectionApplication ${this.appId} | constructed with args:`);
        log([this._item]);
    }
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            closeOnSubmit: false,
            submitOnChange: true,
            id: 'pick-up-stix-container-image-selection',
            template: `/modules/${PICK_UP_STIX_MODULE_NAME}/templates/container-image-selection.html`,
            height: 'auto',
            width: 'auto',
            minimizable: false,
            title: `Choose Container Images`,
        });
    }
    activateListeners(html) {
        log(` ContainerImageSelectionApplication ${this.appId} | activateListeners called with args:`);
        log([html]);
        this._html = html;
        super.activateListeners(this._html);
        $(html).find('img').css('max-width', '160px').css('height', '160px').first().css('margin-right', '20px');
        $(html).find('img').on('click', this._onClickImage);
        $(html).find('h2').css('font-family', `"Modesto Condensed", "Palatino Linotype", serif`);
    }
    getData() {
        const data = {
            data: this._item.data,
        };
        log(data);
        return data;
    }
    async _updateObject(e, formData) {
        log(` ContainerImageSelectionApplication ${this.appId} | _updateObject`);
        log([e, formData]);
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
}
