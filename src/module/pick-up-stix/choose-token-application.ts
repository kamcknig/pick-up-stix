export default class ChooseTokenApplication extends Application {
	static get defaultOptions(): ApplicationOptions {
		return mergeObject(super.defaultOptions, {
			closeOnSubmit: true,
			submitOnClose: true,
			id: "pick-up-stix-choose-token",
      template: "modules/pick-up-stix/module/pick-up-stix/templates/choose-token.html",
      width: 450,
      height: 250,
			minimizable: false,
			title: `Choose Token`,
			resizable: true,
			classes: ['pick-up-stix', 'choose-token']
		});
	}

  private _tokens: Token[];
  private _selectedToken: Token;

	constructor(tokens: Token[]) {
    super({});
    console.log(`pick-up-stix | ChooseTokenApplication ${this.appId} | constructor called with args:`);
    this._tokens = tokens.filter(t => t.getFlag('pick-up-stix', 'pick-up-stix') === undefined)
    console.log(this._tokens);
  }

  activateListeners(html) {
    console.log(`pick-up-stix | ChooseTokenApplication ${this.appId} | activateListeners`);
    super.activateListeners(html);
    $(html).find('.token-selection').on('click', e => {
      this._selectedToken = this._tokens.find(t => t.id === e.currentTarget.dataset.tokenId);
      console.log(`pick-up-stix | ChooseTokenApplication ${this.appId} | token '${this._selectedToken.id}' clicked`);
      this.close();
    });
  }

  getData(): any {
    console.log(`pick-up-stix | ChooseTokenApplication ${this.appId} | getData`);
    const d = {
      selectedToken: this._selectedToken,
      tokens: this._tokens.map(t => ({ ...t.data }))
    };
    console.log(d);
    return d;
  }
}
