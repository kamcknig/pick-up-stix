/**
 * Application class to display to select an item that the token is
 * associated with
 */
export default class ContainerImageSelectionApplication extends FormApplication {
	static get defaultOptions(): FormApplicationOptions {
    return mergeObject(super.defaultOptions, {
      closeOnSubmit: false,
      submitOnChange: true,
      id: "pick-up-stix-container-image-selection",
	    template: "modules/pick-up-stix/module/pick-up-stix/templates/container-image-selection.html",
      height: 'auto',
      width: 'auto',
		  minimizable: false,
      title: `Choose Container Images`
    });
	}

	private _html: any;

	constructor(private _token: Token) {
		super(_token);
		console.log(`pick-up-stix | ContainerImageSelectionApplication | constructed with args:`)
		console.log(this._token);
	}

	activateListeners(html) {
		console.log(`pick-up-stix | ContainerImageSelectionApplication | activateListeners called with args:`);
		console.log(html);

    this._html = html;
    super.activateListeners(this._html);

    $(html).find('img').css('max-width', '160px').css('height', '160px').first().css('margin-right', '20px');
    $(html).find('img').click(e => this._onClickImage(e));

    $(html).find('h2').css('font-family', `"Modesto Condensed", "Palatino Linotype", serif`);
	}

	getData() {
    const data = {
      data: this._token.data
    }
    console.log(data);
    return data;
  }

  protected _onClickImage(e) {
    const attr = e.currentTarget.dataset.edit;
    const current = getProperty(this._token.data, `flags.pick-up-stix.pick-up-stix.${attr}`);
    new FilePicker({
      type: "image",
      current,
      callback: path => {
        e.currentTarget.src = path;
        this._onSubmit(event);
      },
      top: this.position.top + 40,
      left: this.position.left + 10
    }).browse(current);
  }

  _updateObject(e, formData) {
    setProperty(formData, 'flags.pick-up-stix.pick-up-stix.imageContainerOpenPath', formData.imageContainerOpenPath);
    setProperty(formData, 'flags.pick-up-stix.pick-up-stix.imageContainerClosedPath', formData.imageContainerClosedPath);
    delete formData.imageContainerOpenPath;
    delete formData.imageContainerClosedPath;
    return this.object.update(formData);
  }
}
