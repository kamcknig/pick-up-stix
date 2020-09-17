export enum SetttingKeys {
	openImagePath = 'default-container-opened-image-path',
	closeImagePath = 'default-container-closed-image-path',
	disableCurrencyLoot = 'disable-currency-loot',
	defaultContainerCloseSound = 'default-container-close-sound',
	defaultContainerOpenSound = 'default-container-open-sound',
	version = 'version'
}

const systemCurrenciesImplemented = [
	'dnd5e'
];

export const registerSettings = function() {
	console.log(`pick-up-stix | registerSettings`);
	// Register any custom module settings here
	const imageTypeFunc = (val) => {
		return val;
	}
	Object.defineProperty(imageTypeFunc, 'name', {value: 'pick-up-stix-settings-image'});

	const audioTypeFunc = (val) => {
		return val;
	}
	Object.defineProperty(audioTypeFunc, 'name', {value: 'pick-up-stix-settings-audio'});

	game.settings.register('pick-up-stix', SetttingKeys.version, {
		name: 'Version',
		hint: 'Used to track which version is last loaded, so that we can give updates to users',
		scope: 'world',
		config: false,
		type: String,
		default: undefined
	});

	// Register any custom module settings here
	game.settings.register('pick-up-stix', SetttingKeys.openImagePath, {
		name: 'Default Container Opened Image',
		hint: 'Sets the path for the default image to use for opened containers',
		scope: 'world',
		config: true,
		type: imageTypeFunc,
		default: 'modules/pick-up-stix/assets/chest-opened.png'
	});
	game.settings.register('pick-up-stix', SetttingKeys.closeImagePath, {
		name: 'Default Container Closed Image',
		hint: 'Sets the path for the default image to use for closed containers',
		scope: 'world',
		config: true,
		type: imageTypeFunc,
		default: 'modules/pick-up-stix/assets/chest-closed.png'
	});

	game.settings.register('pick-up-stix', SetttingKeys.disableCurrencyLoot, {
		name: 'Disable Currency Loot',
		hint: `This option is enabled by default for systems that have not been implemented in Pick-Up-Stix yet. You can also use it to manually disable currency if you don't wish to have currency as loot.`,
		scope: 'world',
		config: true,
		type: Boolean,
		default: !systemCurrenciesImplemented.includes(game.system.id)
	});

	game.settings.register('pick-up-stix', SetttingKeys.defaultContainerOpenSound, {
		name: 'Default Container Open Sound',
		hint: 'The default sound to play when opening a container.',
		scope: 'world',
		type: audioTypeFunc,
		config: true
	});

	game.settings.register('pick-up-stix', SetttingKeys.defaultContainerCloseSound, {
		name: 'Default Container Close Sound',
		hint: 'The default sound to play when closing a container.',
		scope: 'world',
		type: audioTypeFunc,
		config: true
	});
}

export function processHtml(html) {
	$(html)
		.find('input[data-dtype="pick-up-stix-settings-image"')
		.each(function() {
			const settingName = $(this).attr('name').split('.')[1];
			console.log(settingName);

			let picker = new FilePicker({
				type: 'image',
				current: game.settings.get('pick-up-stix', settingName),
				field: $(this)[0]
			});

			let pickerButton = $('<button type="button" class="file-picker" title="Pick image"><i class="fas fa-file-import fa-fw"></i></button>');
			pickerButton.on("click", function () {
				picker.render(true);
			});
			$(this).parent().append(pickerButton);
		});

		$(html)
		.find('input[data-dtype="pick-up-stix-settings-audio"')
		.each(function() {
			const settingName = $(this).attr('name').split('.')[1];
			console.log(settingName);

			let picker = new FilePicker({
				type: 'audio',
				current: game.settings.get('pick-up-stix', settingName),
				field: $(this)[0]
			});

			let pickerButton = $('<button type="button" class="file-picker" title="Pick image"><i class="fas fa-file-import fa-fw"></i></button>');
			pickerButton.on("click", function () {
				picker.render(true);
			});
			$(this).parent().append(pickerButton);
		})
}
