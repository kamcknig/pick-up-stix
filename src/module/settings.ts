
import { log } from "../main";
import ImagePicker from "./libs/ImagePicker";
import SoundPicker from "./libs/SoundPicker";


export const PICK_UP_STIX_MODULE_NAME = 'pick-up-stix';

export const PICK_UP_STIX_FLAG = 'pick-up-stix';

export const PICK_UP_STIX_ITEM_ID_FLAG = 'pick-up-stix.itemId';

export const PICK_UP_STIX_TOKEN_ID_FLAG = 'pick-up-stix.tokenId';

export const PICK_UP_STIX_SOCKET = 'module.pick-up-stix';

/**
 * Because typescript doesn't know when in the lifecycle of foundry your code runs, we have to assume that the
 * canvas is potentially not yet initialized, so it's typed as declare let canvas: Canvas | {ready: false}.
 * That's why you get errors when you try to access properties on canvas other than ready.
 * In order to get around that, you need to type guard canvas.
 * Also be aware that this will become even more important in 0.8.x because no canvas mode is being introduced there.
 * So you will need to deal with the fact that there might not be an initialized canvas at any point in time.
 * @returns
 */
 export function getCanvas(): Canvas {
	if (!(canvas instanceof Canvas) || !canvas.ready) {
		throw new Error('Canvas Is Not Initialized');
	}
	return canvas;
}

/**
 * Because typescript doesn't know when in the lifecycle of foundry your code runs, we have to assume that the
 * canvas is potentially not yet initialized, so it's typed as declare let canvas: Canvas | {ready: false}.
 * That's why you get errors when you try to access properties on canvas other than ready.
 * In order to get around that, you need to type guard canvas.
 * Also be aware that this will become even more important in 0.8.x because no canvas mode is being introduced there.
 * So you will need to deal with the fact that there might not be an initialized canvas at any point in time.
 * @returns
 */
export function getGame(): Game {
	if (!(game instanceof Game)) {
		throw new Error("Game Is Not Initialized");
	}
	return game;
}

export enum SettingKeys {
	openImagePath = 'default-container-opened-image-path',
	closeImagePath = 'default-container-closed-image-path',
	disableCurrencyLoot = 'disable-currency-loot',
	defaultContainerCloseSound = 'default-container-close-sound',
	defaultContainerOpenSound = 'default-container-open-sound',
	version = 'version',
	lootTokenData = 'lootTokenData',
	parentItemFolderId = 'parentFolderId',
	tokenFolderId = 'tokenFolderId',
	itemFolderId = 'itemFolderId',
	version13updatemessage = 'version13updatemessage',
	GMActionTimeout = 'GMActionTimeout',
	addItemOnContainerCreation = 'addItemOnContainerCreation',
	enableLootTokenPerceiveReveal = 'enableLootTokenPerceiveReveal',
	defaultMinimumPerceiveValue = 'defaultMinimumPerceiveValue'
}

const systemCurrenciesImplemented = [
	'dnd5e','D35E'
];

export const gmActionTimeout = (multiplier: number = 1000): number => {
	return <number>(getGame().settings?.get(PICK_UP_STIX_MODULE_NAME, SettingKeys.GMActionTimeout) ?? 2) * multiplier;
}

// const imageTypeFunc = (val) => {
// 	return val;
// }
// Object.defineProperty(imageTypeFunc, 'name', {value: 'pick-up-stix-settings-image'});

// const audioTypeFunc = (val) => {
// 	return val;
// }
// Object.defineProperty(audioTypeFunc, 'name', {value: 'pick-up-stix-settings-audio'});

export const registerSettings = function() {
	log(`registerSettings`);
	registerHiddenSettings();
	registerWorldSettings();
	registerClientSettings();
}

const registerHiddenSettings = () => {
	getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.GMActionTimeout, {
		name: 'GM Action Timeout',
		hint: 'Controls the amount of time to wait for a GM client to perform a GM action before giving up',
		scope: 'world',
		type: Number,
		default: 2,
		config: false
	});

  getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.version13updatemessage, {
    name: 'Version 13 Update Message',
    hint: 'Tracks if user received the version 13 update message',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false
  });

	getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.version, {
		name: 'Version',
		hint: 'Used to track which version is last loaded, so that we can give updates to users',
		scope: 'world',
		config: false,
		type: String,
		default: '0.0.0'
	});

	getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.parentItemFolderId, {
		name: 'Parent Item Folder ID',
		hint: 'The folder ID of the main Pick-Up-Stix folder in the Items Directory',
		scope: 'world',
		config: false,
		type: String
	});

	getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.itemFolderId, {
		name: 'Items Folder ID',
		hint: 'The Folder ID of the sub folder to hold templates for loot',
		scope: 'world',
		config: false,
		type: String
	});

	getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.tokenFolderId, {
		name: 'Tokens folder ID',
		hint: 'The Folder ID of the sub folder to hold Items representing tokens',
		scope: 'world',
		config: false,
		type: String
	});
}

const registerWorldSettings = () => {
	getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.enableLootTokenPerceiveReveal, {
		name: 'Loot Token Reveal',
		hint: `Enables auto-revealing loot tokens that players with controlled tokens are able to see with their passive 'perceive' value.`,
		scope: 'world',
		config: getGame().system.id === 'dnd5e',
		type: Boolean,
		default: false
	});

	getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.defaultMinimumPerceiveValue, {
		name: 'Minimum Perceive Value',
		hint: `The minimum value a token's actor must have in order to perceive a hidden loot token.`,
		scope: 'world',
		config: getGame().system.id === 'dnd5e',
		type: Number,
		default: 10
	});

	getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.openImagePath, {
		name: 'Default Container Opened Image',
		hint: 'Sets the path for the default image to use for opened containers',
		scope: 'world',
		config: true,
		//@ts-ignore
		type: ImagePicker, //imageTypeFunc,
		default: 'modules/pick-up-stix/assets/chest-opened.png'
	});

	getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.closeImagePath, {
		name: 'Default Container Closed Image',
		hint: 'Sets the path for the default image to use for closed containers',
		scope: 'world',
		config: true,
		//@ts-ignore
		type: ImagePicker, //imageTypeFunc,
		default: 'modules/pick-up-stix/assets/chest-closed.png'
	});

	getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.disableCurrencyLoot, {
		name: 'Disable Currency Loot',
		hint: `This option is enabled by default for systems that have not been implemented in Pick-Up-Stix yet. You can also use it to manually disable currency if you don't wish to have currency as loot.`,
		scope: 'world',
		config: true,
		type: Boolean,
		default: !systemCurrenciesImplemented.includes(getGame().system.id)
	});

	getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.defaultContainerOpenSound, {
		name: 'Default Container Open Sound',
		hint: 'The default sound to play when opening a container.',
		scope: 'world',
		//@ts-ignore
		type: SoundPicker, //audioTypeFunc,
		config: true
	});

	getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.defaultContainerCloseSound, {
		name: 'Default Container Close Sound',
		hint: 'The default sound to play when closing a container.',
		scope: 'world',
		//@ts-ignore
		type: SoundPicker, //audioTypeFunc,
		config: true
	});

	getGame().settings.register(PICK_UP_STIX_MODULE_NAME, SettingKeys.addItemOnContainerCreation, {
		name: 'Auto-add Item',
		hint: `When enabled and dragging an Item to the canvas in order to create a container, the Item used to create the container will automatically be added to the created container rather than creating an empty container.`,
		scope: 'world',
		config: true,
		type: Boolean,
		default: true
	});
}

const registerClientSettings = () => {

}

// export function processHtml(html) {
// 	$(html)
// 		.find('input[data-dtype="pick-up-stix-settings-image"')
// 		.each(function() {
// 			const settingName = <string>($(this).attr('name')?.split('.')[1]);
// 			log(settingName);

// 			let picker = new FilePicker({
// 				type: 'image',
// 				current: getGame().settings?.get(PICK_UP_STIX_MODULE_NAME, settingName),
// 				field: $(this)[0]
// 			});

// 			let pickerButton = $('<button type="button" class="file-picker" title="Pick image"><i class="fas fa-file-import fa-fw"></i></button>');
// 			pickerButton.on("click", function () {
// 				picker.render(true);
// 			});
// 			$(this).parent().append(pickerButton);
// 		});

// 		$(html)
// 		.find('input[data-dtype="pick-up-stix-settings-audio"')
// 		.each(function() {
// 			const settingName = $(this).attr('name').split('.')[1];
// 			log(settingName);

// 			let picker = new FilePicker({
// 				type: 'audio',
// 				current: getGame().settings.get(PICK_UP_STIX_MODULE_NAME, settingName),
// 				field: $(this)[0]
// 			});

// 			let pickerButton = $('<button type="button" class="file-picker" title="Pick image"><i class="fas fa-file-import fa-fw"></i></button>');
// 			pickerButton.on("click", function () {
// 				picker.render(true);
// 			});
// 			$(this).parent().append(pickerButton);
// 		})
// }