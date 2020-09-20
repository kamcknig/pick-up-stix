import { ItemType } from "../models";
import { SettingKeys } from "../settings";
import { getCurrencyTypes } from "../../../utils";

export async function onPreCreateItem(itemData: any, options: any, userId: string) {
	console.log(`pick-up-stix | onPreCreateItem | called with args:`);
	console.log([itemData, options, userId]);

	if (itemData.type.toLowerCase() === ItemType.CONTAINER) {
		options.renderSheet = false;

		setProperty(itemData, 'type', game.system.entityTypes.Item.includes('backpack') ? 'backpack' : game.system.entityTypes.Item[0]);

		setProperty(itemData, 'flags.pick-up-stix', {
			version: game.settings.get('pick-up-stix', SettingKeys.version),
			'pick-up-stix': {
				container: {
					currency: Object.keys(getCurrencyTypes()).reduce((acc, shortName) => ({...acc, [shortName]: 0}), {}),
					imageOpenPath: game.settings.get('pick-up-stix', SettingKeys.openImagePath),
					imageClosePath: game.settings.get('pick-up-stix', SettingKeys.closeImagePath),
					soundClosePath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerCloseSound),
					soundOpenPath: game.settings.get('pick-up-stix', SettingKeys.defaultContainerOpenSound),
					canOpen: true,
					isOpen: false
				},
				isLocked: false,
				itemType: ItemType.CONTAINER
			}
		});

		setProperty(itemData, 'img', game.settings.get('pick-up-stix', SettingKeys.closeImagePath));
	}

	console.log(`pick-up-stix | onPreCreateItem | final data:`);
	console.log(itemData);
}
