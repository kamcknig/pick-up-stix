export async function onUpdateToken(scene: Scene, tokenData: any, tokenFlags: any, userId: string) {
  console.log(`pick-up-stix | onUpdateToken | called with args:`)
  console.log([scene, tokenData, tokenFlags, userId]);

  const flags = getProperty(tokenData, 'flags.pick-up-stix.pick-up-stix');

	if (flags) {
      console.log(`pick-up-stix | onUpdateToken | found flags on token data, add mouse interaction`);
			const token: Token = canvas?.tokens?.placeables?.find((p: PlaceableObject) => p.id === tokenData._id);

			if (flags.isLocked) {
				console.log(`pick-up-stix | onUpdateToken | token is locked, draw lock icon`);
				await new Promise(resolve => {
					setTimeout(() => {
						// TODO: update
            // drawLockIcon(token);
            resolve();
					}, 0);
				});
			}
			else {
				console.log(`pick-up-stix | onUpdateToken | token is not locked, check for locked image`);
				const lock = token.getChildByName('pick-up-stix-lock');
				console.log(`pick-up-stix | onUpdateToken | lock image ${!!lock ? ' found' : ' not found'}`);
				if (lock) {
					token.removeChild(lock);
					lock.destroy();
				}
			}

			//token.mouseInteractionManager = setupMouseManager.bind(token)();
			//token.activateListeners = setupMouseManager.bind(token);
	}
};
