import { ItemType } from "../models";
import { SettingKeys } from "../settings";
import { getCurrencyTypes } from "../../../utils";

export async function preCreateItemHook(itemData: any, options: any, userId: string) {
	console.log(`pick-up-stix | preCreateItemHook | called with args:`);
	console.log([itemData, options, userId]);

	if (itemData.type.toLowerCase() === ItemType.CONTAINER) {
		console.log('pick-up-stix | preCreateItemHook');

		// we checked for item type being container, but that isn't a "valid" type. The type of item has to be included in the
		// game.system.entityTypes.Item array. So we look for one that is "container-like"; backbpack because that's one that dnd
		// 5e uses, and if we don't find that we just take whatever thed first item type is. Really it doesn't even matter right now
		// as the type of this item isn't important, we use the flags itemType property to determine if it's an item or a container
		// anywhere else anyway
		setProperty(itemData, 'type', game.system.entityTypes.Item.includes('backpack') ? 'backpack' : game.system.entityTypes.Item[0]);

		const defaultContainerFlags = {
			'pick-up-stix': {
				container: {
					currency: Object.keys(getCurrencyTypes()).reduce((acc, shortName) => ({...acc, [shortName]: 0}), {}),
					imageOpenPath: game.settings.get('pick-up-stix', SettingKeys.openImagePath),
					imageClosePath: game.settings.get('pick-up-stix', SettingKeys.closeImagePath),
					soundClosePath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerCloseSound),
					soundOpenPath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerOpenSound),
					canClose: true,
					isOpen: false
				},
				isLocked: false,
				itemType: ItemType.CONTAINER
			}
		};

		const flags = getProperty(itemData, 'flags.pick-up-stix');
		if (!flags) {
			options.renderSheet = false;
			setProperty(itemData, 'flags.pick-up-stix', {
				...defaultContainerFlags
			});
		}

		setProperty(itemData, 'img', game.settings.get('pick-up-stix', SettingKeys.closeImagePath));
	}

	console.log(`pick-up-stix | preCreateItemHook | final data:`);
	console.log(itemData);
}
