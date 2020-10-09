import { createToken } from "./main";
import { SettingKeys } from "./settings";

interface TokenData {
  name: string;
  disposition: number;
  x: number;
  y: number;
  img: string;
}

export class LootToken {
  static async create(tokenData: TokenData, lootData?: any): Promise<LootToken> {
    const tokenId = await createToken({
      ...tokenData
    });

    const t = new LootToken(tokenId, lootData);
    t.activateListeners();
    return t;
  }

  static get lootTokens(): any {
    return duplicate(game.settings.get('pick-up-stix', SettingKeys.lootTokens));
  }

  get token(): Token {
    return canvas.tokens.placeables.find(p => p.id === this._tokenId);
  }

  constructor(
    private _tokenId: string,
    private _lootData?: any
  ) {
    this.save();
  }

  private deleteTokenHook = (scene, token, options, userId) => {
    if (token._id !== this._tokenId) {
      return;
    }

    console.log(`pick-up-stix | LootToken | deleteTokenHook`);
    this.remove();
  }

  save = async () => {
    console.log(`pick-up-stix | LootToken | save`);
    const tokens = LootToken.lootTokens;
    tokens[this._tokenId] = { ...this._lootData };
    await game.settings.set('pick-up-stix', SettingKeys.lootTokens, tokens);
  }

  activateListeners() {
    Hooks.on('deleteToken', this.deleteTokenHook);
  }

  remove = async () => {
    console.log(`pick-up-stix | LootToken | removeToken`);
    Hooks.off('deleteToken', this.deleteTokenHook);
    const tokens = LootToken.lootTokens;
    delete tokens[this._tokenId];
    await game.settings.set('pick-up-stix', SettingKeys.lootTokens, tokens);
  }
}
