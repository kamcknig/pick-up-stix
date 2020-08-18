export enum DefaultSetttingKeys {
	openImagePath = 'default-container-opened-image-path',
	closeImagePath = 'default-container-closed-image-path'
}

export const registerSettings = function() {
	console.log(`pick-up-stix | registerSettings`);
	// Register any custom module settings here
	const typeFunc = (val) => {
		return val;
	}
	Object.defineProperty(typeFunc, 'name', {value: 'pick-up-stix-settings-image'});

	// Register any custom module settings here
	game.settings.register('pick-up-stix', DefaultSetttingKeys.openImagePath, {
		name: 'Default Container Opened Image',
		hint: 'Sets the path for the default image to use for opened containers',
		scope: 'world',
		config: true,
		type: typeFunc,
		default: 'modules/pick-up-stix/assets/chest-opened.png'
	});
	game.settings.register('pick-up-stix', DefaultSetttingKeys.closeImagePath, {
		name: 'Default Container Closed Image',
		hint: 'Sets the path for the default image to use for closed containers',
		scope: 'world',
		config: true,
		type: typeFunc,
		default: 'modules/pick-up-stix/assets/chest-closed.png'
	});
}

export function processHtml(html) {
	$(html)
		.find('input[data-dtype="pick-up-stix-settings-image"')
		.each(function() {
			const settingName = $(this).attr('name').split('.')[1];
			console.log(settingName);

			let picker = new FilePicker({
				type: 'Image',
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
