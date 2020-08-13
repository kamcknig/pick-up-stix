export const preloadTemplates = async function() {
	const templatePaths = [
		'modules/pick-up-stix/module/pick-up-stix/templates/item-config.html',
		'modules/pick-up-stix/module/pick-up-stix/templates/container-image-selection.html',
		'modules/pick-up-stix/module/pick-up-stix/templates/choose-token.html',
	];

	return loadTemplates(templatePaths);
}
