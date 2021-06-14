import { log } from "../../log";
import {
  updateItem
} from "./main";

/**
 * Application class to display to select an item that the token is
 * associated with
 */
export default class ContainerImageSelectionApplication extends FormApplication {

	static get defaultOptions(): FormApplication.Options {
    return mergeObject(super.defaultOptions, {
      closeOnSubmit: false,
      submitOnChange: true,
      id: "pick-up-stix-container-image-selection",
	    template: "modules/pick-up-stix/module/pick-up-stix/templates/container-image-selection.html",
      height: 'auto',
      //@ts-ignore
      width: 'auto',
		  minimizable: false,
      title: `Choose Container Images`
    });
	}

	private _html: any;

	constructor(private _item: Item) {
		super(_item);
		log(`pick-up-stix | ContainerImageSelectionApplication ${this.appId} | constructed with args:`)
		log([this._item]);
	}

	activateListeners(html) {
    log(`pick-up-stix | ContainerImageSelectionApplication ${this.appId} | activateListeners called with args:`);
		log([html]);

    this._html = html;
    super.activateListeners(this._html);

    $(html)
      .find('img')
      .css('max-width', '160px')
      .css('height', '160px')
      .first()
      .css('margin-right', '20px');

    $(html)
      .find('img')
      .on('click', this._onClickImage);

    $(html)
      .find('h2')
      .css('font-family', `"Modesto Condensed", "Palatino Linotype", serif`);
	}

	getData():any {
    const data = {
      data: this._item.data
    }
    log(data);
    return data;
  }

  protected _onClickImage = (e) => {
    const attr = e.currentTarget.dataset.edit;
    const current = getProperty(this._item.data, `flags.pick-up-stix.pick-up-stix.${attr}`);
    new FilePicker({
      type: "image",
      current,
      //@ts-ignore
      callback: (path) => {
        e.currentTarget.src = path;
        this._onSubmit(e);
      },
      //@ts-ignore
      top: this.position.top + 40,
      //@ts-ignore
      left: this.position.left + 10
    }).browse(current);
  }

  async _updateObject(e, formData) {
    log(`pick-up-stix | ContainerImageSelectionApplication ${this.appId} | _updateObject`);
    log([e, formData]);
    //@ts-ignore
    await updateItem(this.object.id, {
      'flags': {
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
}
