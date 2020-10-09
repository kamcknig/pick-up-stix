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

    return new LootToken(tokenId, lootData);
  }

  static get lootTokens(): any {
    return duplicate(game.settings.get('pick-up-stix', SettingKeys.lootTokens));
  }

  get token(): Token {
    return canvas.tokens.placeables.find(p => p.id === this._tokenId);
  }

  constructor(
    private _tokenId: string,
    public lootData?: any
  ) {
    const tokens = LootToken.lootTokens;
    tokens[_tokenId] = lootData;
    game.settings.set('pick-up-stix', SettingKeys.lootTokens, tokens);
  }
}
