import { canvasReadyHook } from "./module/pick-up-stix/hooks/canvas-ready-hook.js";
import { createActorHook } from "./module/pick-up-stix/hooks/create-actor-hook.js";
import { createItemHook as createItemHook } from "./module/pick-up-stix/hooks/create-item-hook.js";
import { initHook } from "./module/pick-up-stix/hooks/init-hook.js";
import { readyHook } from "./module/pick-up-stix/hooks/ready-hook.js";
import { preCreateItemHook } from "./module/pick-up-stix/hooks/pre-create-item-hook.js";
import { onRenderLootHud } from "./module/pick-up-stix/hooks/render-loot-hud-hook.js";
import { getCanvas } from "./module/pick-up-stix/settings.js";
import { deleteTokenHook } from "./module/pick-up-stix/hooks/delete-token-hook.js";
import { lootTokenCreatedHook } from "./module/pick-up-stix/hooks/loot-token-created-hook.js";
import { LootHud } from "./module/pick-up-stix/loot-hud-application.js";
import { updateItemHook } from "./module/pick-up-stix/hooks/update-item-hook.js";
import { deleteItemHook } from "./module/pick-up-stix/hooks/delete-item-hook.js";
import { preUpdateItemHook } from "./module/pick-up-stix/hooks/pre-update-item-hook.js";
import { renderItemDirectoryHook } from "./module/pick-up-stix/hooks/render-item-directory-hook.js";
import { preUpdateTokenHook } from "./module/pick-up-stix/hooks/pre-update-token-hook.js";
import { log } from "./log.js";
import { PickUpStixHooks } from "./module/pick-up-stix/models.js";
import { makeContainerApi } from "./module/pick-up-stix/main.js";
// game startup hooks
Hooks.once('init', initHook);
Hooks.once('canvasReady', () => {
    //@ts-ignore
    getCanvas().hud.pickUpStixLootHud = new LootHud();
});
Hooks.on('canvasReady', canvasReadyHook);
Hooks.on('ready', readyHook);
// item hooks
Hooks.on('preCreateItem', preCreateItemHook);
Hooks.on('createItem', createItemHook);
Hooks.on('preUpdateItem', preUpdateItemHook);
Hooks.on('updateItem', updateItemHook);
Hooks.on('deleteItem', deleteItemHook);
// directory hooks
Hooks.on('renderItemDirectory', renderItemDirectoryHook);
// actor hooks
Hooks.on('createActor', createActorHook);
// token hooks
Hooks.on('deleteToken', deleteTokenHook);
Hooks.on('preUpdateToken', preUpdateTokenHook);
// render hooks
Hooks.on("renderSettingsConfig", (app, html, user) => {
    // processHtml(html); // MOD 4535992 removed because filePicker is integrated on foundryvtt 0.8.6
});
Hooks.on('renderLootHud', onRenderLootHud);
Hooks.on(PickUpStixHooks.lootTokenCreated, lootTokenCreatedHook);
Hooks.once('ready', () => {
    log('pick-up-stix | ready once hook');
    if (game.system.id === 'dnd5e') {
        Hooks.on('renderItemSheet5e', (app, protoHtml, data) => {
            log(`pick-up-stix | renderItemSheet5e`);
            log([app, protoHtml, data]);
            const item = app.object;
            // can't edit the size of owned items
            if (item.actor)
                return;
            let html = protoHtml;
            if (html[0].localName !== "div") {
                html = $(html[0].parentElement.parentElement);
            }
            const content = `
      <div class="form-group">
        <label>Width</label>
        <input type="text" name="flags.pick-up-stix.pick-up-stix.tokenData.width" value="${item.data.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.width ?? 1}" data-dtype="Number">
      </div>

      <div class="form-group">
        <label>Height</label>
        <input type="text" name="flags.pick-up-stix.pick-up-stix.tokenData.height" value="${item.data.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.height ?? 1}" data-dtype="Number">
      </div>
    `;
            $(html)
                .find('div.item-properties div.form-group')
                .last()
                .after(content);
        });
    }
    if (game.user.isGM) {
        //@ts-ignore
        game.modules.get('pick-up-stix').apis = {};
        //@ts-ignore
        game.modules.get('pick-up-stix').apis.v = 1;
        //@ts-ignore
        game.modules.get('pick-up-stix').apis.makeContainer = makeContainerApi;
    }
});

//# sourceMappingURL=maps/pick-up-stix.js.map