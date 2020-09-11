import { setupMouseManager } from "../main";

export async function onCreateToken(scene: Scene, tokenData: any, options: any, userId: string) {
  console.log(`pick-up-stix | onCreateToken | called with args:`);
  console.log([scene, tokenData, options, userId]);

  const flags = getProperty(tokenData, 'flags.pick-up-stix.pick-up-stix');

	if (flags) {
      console.log(`pick-up-stix | onCreateToken | found flags on token data, add mouse interaction`);
      const token: Token = canvas?.tokens?.placeables?.find((p: PlaceableObject) => p.id === tokenData._id);
			token.mouseInteractionManager = setupMouseManager.bind(token)();
			token.activateListeners = setupMouseManager.bind(token);
	}
};
