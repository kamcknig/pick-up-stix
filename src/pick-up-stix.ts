import { canvasReadyHook } from "./module/hooks/canvas-ready-hook";
import { createActorHook } from "./module/hooks/create-actor-hook";
import { createItemHook as createItemHook } from "./module/hooks/create-item-hook";
import { initHook } from "./module/hooks/init-hook";
import { readyHook } from "./module/hooks/ready-hook";
import { preCreateItemHook } from "./module/hooks/pre-create-item-hook";
import { onRenderLootHud } from "./module/hooks/render-loot-hud-hook";
import { getCanvas } from "./module/settings";
import { deleteTokenHook } from "./module/hooks/delete-token-hook";
import { lootTokenCreatedHook } from "./module/hooks/loot-token-created-hook";
import { LootHud } from "./module/loot-hud-application";
import { updateItemHook } from "./module/hooks/update-item-hook";
import { deleteItemHook } from "./module/hooks/delete-item-hook";
import { preUpdateItemHook } from "./module/hooks/pre-update-item-hook";
import { renderItemDirectoryHook } from "./module/hooks/render-item-directory-hook";
import { preUpdateTokenHook } from "./module/hooks/pre-update-token-hook";
import { PickUpStixHooks } from "./module/models";
import { makeContainerApi } from './module/main';
import { getGame, PICK_UP_STIX_MODULE_NAME } from "./module/settings";

export let debugEnabled = 0;
// 0 = none, warnings = 1, debug = 2, all = 3
export let debug = (...args) => {if (debugEnabled > 1) console.log(`DEBUG:${PICK_UP_STIX_MODULE_NAME} | `, ...args)};
export let log = (...args) => console.log(`${PICK_UP_STIX_MODULE_NAME} | `, ...args);
export let warn = (...args) => {if (debugEnabled > 0) console.warn(`${PICK_UP_STIX_MODULE_NAME} | `, ...args)};
export let error = (...args) => console.error(`${PICK_UP_STIX_MODULE_NAME} | `, ...args);
export let timelog = (...args) => warn(`${PICK_UP_STIX_MODULE_NAME} | `, Date.now(), ...args);

export let i18n = key => {
  return getGame().i18n.localize(key);
};
export let i18nFormat = (key, data = {}) => {
  return getGame().i18n.format(key, data);
}

export let setDebugLevel = (debugText: string) => {
  debugEnabled = {"none": 0, "warn": 1, "debug": 2, "all": 3}[debugText] || 0;
  // 0 = none, warnings = 1, debug = 2, all = 3
  if (debugEnabled >= 3) CONFIG.debug.hooks = true;
}

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

  if (getGame().system.id === 'dnd5e') {
    Hooks.on('renderItemSheet5e', (app, protoHtml, data) => {
      log(`${PICK_UP_STIX_MODULE_NAME} | renderItemSheet5e`);
      log([app, protoHtml, data]);

      const item: Item = app.object;

      // can't edit the size of owned items
      if (item.actor) return;

      let html = protoHtml;

      if (html[0].localName !== "div") {
        html = $(html[0].parentElement.parentElement);
      }
      //@ts-ignore
      const width:number = item?.data?.flags[PICK_UP_STIX_MODULE_NAME]?.tokenData?.width ?? 1;
      //@ts-ignore
      const height:number = item?.data?.flags[PICK_UP_STIX_MODULE_NAME]?.tokenData?.height ?? 1;
      const content = `
      <div class="form-group">
        <label>Width</label>
        <input type="text" name="flags.pick-up-stix.tokenData.width" value="${width}" data-dtype="Number">
      </div>

      <div class="form-group">
        <label>Height</label>
        <input type="text" name="flags.pick-up-stix.tokenData.height" value="${height}" data-dtype="Number">
      </div>
    `
      $(html)
        .find('div.item-properties div.form-group')
        .last()
        .after(content);
    });
  }
  if (getGame().user?.isGM) {
    //@ts-ignore
    getGame().modules.get(PICK_UP_STIX_MODULE_NAME).apis = {};
    //@ts-ignore
    getGame().modules.get(PICK_UP_STIX_MODULE_NAME).apis.v = 1;
    //@ts-ignore
		getGame().modules.get(PICK_UP_STIX_MODULE_NAME).apis.makeContainer = makeContainerApi;
	}
});
