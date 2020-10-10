import { canvasReadyHook } from "./module/pick-up-stix/hooks/canvas-ready-hook";
import { onCreateActor } from "./module/pick-up-stix/hooks/create-actor-hook";
import { onCreateItem } from "./module/pick-up-stix/hooks/create-item-hook";
import { deleteTokenHook } from "./module/pick-up-stix/hooks/delete-token-hook";
import { initHook } from "./module/pick-up-stix/hooks/init-hook";
import { onPreCreateOwnedItem } from "./module/pick-up-stix/hooks/pre-create-owned-item-hook";
import { readyHook } from "./module/pick-up-stix/hooks/ready-hook";
import { onPreCreateItem } from "./module/pick-up-stix/hooks/pre-create-item-hook";
import { onRenderLootHud } from "./module/pick-up-stix/hooks/render-loot-hud-hook";
import { onUpdateToken } from "./module/pick-up-stix/hooks/update-token-hook";
import { processHtml } from "./module/pick-up-stix/settings";

// game startup hooks
Hooks.once('init', initHook);
Hooks.on('canvasReady', canvasReadyHook);
Hooks.on('ready', readyHook);

// item hooks
Hooks.on('preCreateItem', onPreCreateItem);
Hooks.on('createItem', onCreateItem);

// actor hooks
Hooks.on('createActor', onCreateActor);
Hooks.on('preCreateOwnedItem', onPreCreateOwnedItem);

// token hooks
Hooks.on('updateToken', onUpdateToken);
Hooks.on('deleteToken', deleteTokenHook);

// render hooks
Hooks.on("renderSettingsConfig", (app, html, user) => {
  processHtml(html);
});
Hooks.on('renderLootHud', onRenderLootHud);
