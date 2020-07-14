export const preloadTemplates = async function() {
	const templatePaths = [
		'modules/pick-up-stix/templates/select-icon.html'
	];

	return loadTemplates(templatePaths);
}
