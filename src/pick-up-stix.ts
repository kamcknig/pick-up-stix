import { canvasReadyHook } from "./module/pick-up-stix/hooks/canvas-ready-hook";
import { onCreateActor } from "./module/pick-up-stix/hooks/create-actor-hook";
import { onCreateItem } from "./module/pick-up-stix/hooks/create-item-hook";
import { initHook } from "./module/pick-up-stix/hooks/init-hook";
import { preCreateOwnedItemHook } from "./module/pick-up-stix/hooks/pre-create-owned-item-hook";
import { readyHook } from "./module/pick-up-stix/hooks/ready-hook";
import { preCreateItemHook } from "./module/pick-up-stix/hooks/pre-create-item-hook";
import { onRenderLootHud } from "./module/pick-up-stix/hooks/render-loot-hud-hook";
import { processHtml } from "./module/pick-up-stix/settings";
import { deleteTokenHook } from "./module/pick-up-stix/hooks/delete-token-hook";
import { lootTokenCreatedHook } from "./module/pick-up-stix/hooks/loot-token-created-hook";

// game startup hooks
Hooks.once('init', initHook);
Hooks.on('canvasReady', canvasReadyHook);
Hooks.on('ready', readyHook);

// item hooks
Hooks.on('preCreateItem', preCreateItemHook);
Hooks.on('createItem', onCreateItem);

// actor hooks
Hooks.on('createActor', onCreateActor);
Hooks.on('preCreateOwnedItem', preCreateOwnedItemHook);

// token hooks
Hooks.on('deleteToken', deleteTokenHook);

// render hooks
Hooks.on("renderSettingsConfig", (app, html, user) => {
  processHtml(html);
});
Hooks.on('renderLootHud', onRenderLootHud);

Hooks.on('pick-up-stix.lootTokenCreated', lootTokenCreatedHook);

Hooks.on('renderItemSheet5e', (app, protoHtml, data) => {
  console.log(`pick-up-stix | renderItemSheet5e`);
  console.log([app, protoHtml, data]);

  const item = app.object;
  const itemData = item.data.data;

  // can't edit the size of owned items
  if (item.actor) return;

  let html = protoHtml;

  if (html[0].localName !== "div") {
    html = $(html[0].parentElement.parentElement);
  }

  const content = `
    <div class="form-group">
      <label>Width</label>
      <input type="text" name="flags.pick-up-stix.pick-up-stix.width" value="${item.data.flags?.['pick-up-stix']?.['pick-up-stix']?.width ?? 1}" data-dtype="Number">
    </div>

    <div class="form-group">
      <label>Height</label>
      <input type="text" name="flags.pick-up-stix.pick-up-stix.height" value="${item.data.flags?.['pick-up-stix']?.['pick-up-stix']?.height ?? 1}" data-dtype="Number">
    </div>
  `
  $(html)
    .find('div.item-properties div.form-group')
    .last()
    .after(content);
});
