export const preloadTemplates = async function() {
	const templatePaths = [
		'modules/pick-up-stix/module/pick-up-stix/templates/item-sheet.html',
		'modules/pick-up-stix/module/pick-up-stix/templates/container-options.html',
		'modules/pick-up-stix/module/pick-up-stix/templates/item-options.html',
		'modules/pick-up-stix/module/pick-up-stix/templates/loot-type-selection.html'
	];

	return loadTemplates(templatePaths);
}
