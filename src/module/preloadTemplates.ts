export const preloadTemplates = async function() {
	const templatePaths = [
		'modules/pick-up-stix/templates/item-sheet.html',
		'modules/pick-up-stix/templates/container-options.html',
		'modules/pick-up-stix/templates/item-options.html',
	];

	return loadTemplates(templatePaths);
}
