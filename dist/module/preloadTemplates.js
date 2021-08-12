import { PICK_UP_STIX_MODULE_NAME } from "./settings.js";
export const preloadTemplates = async function () {
    const templatePaths = [
        // Add paths to "module/XXX/templates"
        //`/modules/${MODULE_NAME}/templates/XXX.html`,
        `/modules/${PICK_UP_STIX_MODULE_NAME}/templates/container-config.html`,
        `/modules/${PICK_UP_STIX_MODULE_NAME}/templates/container-image-selection.html`,
        `/modules/${PICK_UP_STIX_MODULE_NAME}/templates/loot-hud.html`,
        `/modules/${PICK_UP_STIX_MODULE_NAME}/templates/container-sound-config.html`,
        `/modules/${PICK_UP_STIX_MODULE_NAME}/templates/loot-emit-light-config.html`,
    ];
    return loadTemplates(templatePaths);
};

//# sourceMappingURL=../maps/module/preloadTemplates.js.map
