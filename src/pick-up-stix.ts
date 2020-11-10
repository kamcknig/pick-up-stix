import { canvasReadyHook } from "./module/pick-up-stix/hooks/canvas-ready-hook";
import { createActorHook } from "./module/pick-up-stix/hooks/create-actor-hook";
import { createItemHook as createItemHook } from "./module/pick-up-stix/hooks/create-item-hook";
import { initHook } from "./module/pick-up-stix/hooks/init-hook";
import { readyHook } from "./module/pick-up-stix/hooks/ready-hook";
import { preCreateItemHook } from "./module/pick-up-stix/hooks/pre-create-item-hook";
import { onRenderLootHud } from "./module/pick-up-stix/hooks/render-loot-hud-hook";
import { processHtml } from "./module/pick-up-stix/settings";
import { deleteTokenHook } from "./module/pick-up-stix/hooks/delete-token-hook";
import { lootTokenCreatedHook } from "./module/pick-up-stix/hooks/loot-token-created-hook";
import { LootHud } from "./module/pick-up-stix/loot-hud-application";
import { updateItemHook } from "./module/pick-up-stix/hooks/update-item-hook";
import { deleteItemHook } from "./module/pick-up-stix/hooks/delete-item-hook";
import { preUpdateItemHook } from "./module/pick-up-stix/hooks/pre-update-item-hook";
import { renderItemDirectoryHook } from "./module/pick-up-stix/hooks/render-item-directory-hook";
import { preUpdateTokenHook } from "./module/pick-up-stix/hooks/pre-update-token-hook";
import { log } from "./log";

// game startup hooks
Hooks.once('init', initHook);
Hooks.once('canvasReady', () => {
  canvas.hud.pickUpStixLootHud = new LootHud();
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
  processHtml(html);
});
Hooks.on('renderLootHud', onRenderLootHud);

Hooks.on('pick-up-stix.lootTokenCreated', lootTokenCreatedHook);

Hooks.once('ready', () => {
  log('pick-up-stix | ready once hook');

  if (game.system.id === 'dnd5e') {
    Hooks.on('renderItemSheet5e', (app, protoHtml, data) => {
      log(`pick-up-stix | renderItemSheet5e`);
      log([app, protoHtml, data]);

      const item: Item = app.object;

      // can't edit the size of owned items
      if (item.actor) return;

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
    `
      $(html)
        .find('div.item-properties div.form-group')
        .last()
        .after(content);
    });
  }
});
