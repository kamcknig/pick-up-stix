import { LootToken } from "../loot-token";
import { getLootToken, getLootTokenData, lootTokens } from "../main";

export const lootTokenCreatedHook = async (tokenId, data) => {
  console.log(`pick-up-stix | lootTokenCreatedHook:`);
  console.log([tokenId, data]);

  const token: Token = canvas.tokens.placeables.find(p => p.id === tokenId);

  if (!token) {
    console.log(`pick-up-stix | lootTokenCreatedHook | Token '${tokenId} not found`);
  }

  let lootToken = getLootToken(token?.scene?.id, tokenId);

  if (!lootToken) {
    console.log(`pick-up-stix | lootTokenCreatedHook | No LootToken found for '${tokenId}'`);
    lootToken = await LootToken.create({ id: tokenId }, data);
    lootTokens.push(lootToken);
  }

  lootToken?.activateListeners();
}
