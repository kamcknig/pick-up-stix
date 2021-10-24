//@ts-ignore
import ItemSheet5e from "../../../../systems/dnd5e/module/item/sheet.js";
import { getGame, PICK_UP_STIX_MODULE_NAME } from "../settings.js";

export class Container5eItemSheet extends ItemSheet5e {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["container5e", "dnd5ebak", "sheet", "item"],
    });
  }
}

async function addEditorHeadline(app, html, data) {
  html.find(".tab[data-tab=description] .editor").prepend(`<h2 class="details-headline">${getGame().i18n.localize(`${PICK_UP_STIX_MODULE_NAME}.ItemDetailsHeadline`)}</h2>`);
}
 
// // Register Container5e Item Sheet and make default
// Items.registerSheet("dnd5e", Container5eItemSheet, {makeDefault: true});

// Hooks.once("ready", () => {

// 	// can be removed when 0.7.x is stable
//   // if (window.BetterRolls) {
//   //   window.BetterRolls.hooks.addItemSheet("Container5eItemSheet");
//   // }
  
// });

Hooks.on("renderContainer5eItemSheet", (app, html, data) => {
  addEditorHeadline(app, html, data);
});