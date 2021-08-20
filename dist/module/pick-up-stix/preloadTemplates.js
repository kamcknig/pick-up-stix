export const preloadTemplates = async function () {
    const templatePaths = [
        // Add paths to "module/XXX/templates"
        //`/modules/${MODULE_NAME}/templates/XXX.html`,
        'modules/pick-up-stix/module/pick-up-stix/templates/container-config.html',
        'modules/pick-up-stix/module/pick-up-stix/templates/container-image-selection.html',
        'modules/pick-up-stix/module/pick-up-stix/templates/loot-hud.html',
        'modules/pick-up-stix/module/pick-up-stix/templates/container-sound-config.html',
        'modules/pick-up-stix/module/pick-up-stix/templates/loot-emit-light-config.html',
    ];
    return loadTemplates(templatePaths);
};

//# sourceMappingURL=../../maps/module/pick-up-stix/preloadTemplates.js.map
