import { canvasReadyHook } from "./hooks/canvas-ready-hook";
import { createActorHook } from "./hooks/create-actor-hook";
import { createItemHook as createItemHook } from "./hooks/create-item-hook";
import { initHook } from "./hooks/init-hook";
import { readyHook } from "./hooks/ready-hook";
import { preCreateItemHook } from "./hooks/pre-create-item-hook";
import { onRenderLootHud } from "./hooks/render-loot-hud-hook";
import { processHtml } from "./settings";
import { deleteTokenHook } from "./hooks/delete-token-hook";
import { lootTokenCreatedHook } from "./hooks/loot-token-created-hook";
import { LootHud } from "./loot-hud-application";
import { updateItemHook } from "./hooks/update-item-hook";
import { deleteItemHook } from "./hooks/delete-item-hook";
import { preUpdateItemHook } from "./hooks/pre-update-item-hook";
import { renderItemDirectoryHook } from "./hooks/render-item-directory-hook";
import { preUpdateTokenHook } from "./hooks/pre-update-token-hook";
import { log } from "../main";
import { PickUpStixHooks } from "./models";
import { makeContainerApi } from './mainEntry';

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

Hooks.on(PickUpStixHooks.lootTokenCreated, lootTokenCreatedHook);

Hooks.once('ready', () => {
  log('pick-up-stix | ready once hook');

  if (game.system.id === 'dnd5e') {
    Hooks.on('renderItemSheet5e', (app, protoHtml, data) => {
      log(` renderItemSheet5e`);
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
  if (game.user.isGM) {
    game.modules.get('pick-up-stix').apis = {};
    game.modules.get('pick-up-stix').apis.v = 1;
		game.modules.get('pick-up-stix').apis.makeContainer = makeContainerApi;
	}
});
