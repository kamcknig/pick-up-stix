export const preloadTemplates = async function() {
	const templatePaths = [
		'modules/pick-up-stix/module/pick-up-stix/templates/item-config.html',
		'modules/pick-up-stix/module/pick-up-stix/templates/container-image-selection.html',
		'modules/pick-up-stix/module/pick-up-stix/templates/choose-token.html',
		'modules/pick-up-stix/module/pick-up-stix/templates/loot-hud.html',
		'modules/pick-up-stix/module/pick-up-stix/templates/container-sound-config.html',
	];

	return loadTemplates(templatePaths);
}
