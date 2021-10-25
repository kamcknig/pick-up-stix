//@ts-ignore
import ItemSheet5e from '../../../../systems/dnd5e/module/item/sheet.js';
import { log } from '../../main.js';
import { ItemType } from '../models.js';
import { getGame, PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME } from '../settings.js';

export default function registerSheet(): void {
  class ContainerItemApplicationSheet extends ItemSheet {
    static get defaultOptions() {
      return mergeObject(super.defaultOptions, {
        classes: ['container', 'sheet', 'item'],
      });
    }

    constructor(object: Item, options?: ItemSheet.Options) {
      super(object, options);
    }
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  Items.registerSheet?.(PICK_UP_STIX_MODULE_NAME, ContainerConfigApplication, {
    types: [ItemType.CONTAINER],
    makeDefault: false,
    label: 'ITEM.TypeContainer',
  });
}

// async function addEditorHeadline(app, html, data) {
//   html
//     .find('.tab[data-tab=description] .editor')
//     .prepend(
//       `<h2 class="details-headline">${getGame().i18n.localize(`${PICK_UP_STIX_MODULE_NAME}.ItemDetailsHeadline`)}</h2>`,
//     );
// }

// // Register Container Item Sheet and make default
// Items.registerSheet("dnd5e", ContainerItemSheet, {makeDefault: true});

// Hooks.once("ready", () => {

// 	// can be removed when 0.7.x is stable
//   // if (window.BetterRolls) {
//   //   window.BetterRolls.hooks.addItemSheet("ContainerItemSheet");
//   // }

// });

Hooks.on('renderContainerItemSheet', (app, protoHtml, data) => {
  log(`renderContainerItemSheet`);
  log([app, protoHtml, data]);

  const item: Item = app.object;

  // can't edit the size of owned items
  if (item.actor) return;

  let html = protoHtml;

  if (html[0].localName !== 'div') {
    html = $(html[0].parentElement.parentElement);
  }
  const flagValue = (<any>item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG))?.tokenData;
  const widthValue = flagValue?.width ?? 1; // ${item.data.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.width ?? 1}
  const heightValue = flagValue?.height ?? 1; // ${item.data.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.height ?? 1}
  const content = `
    <div class="form-group">
      <label>Width</label>
      <input type="text" name="flags.pick-up-stix.pick-up-stix.tokenData.width" value="${widthValue}" data-dtype="Number">
    </div>

    <div class="form-group">
      <label>Height</label>
      <input type="text" name="flags.pick-up-stix.pick-up-stix.tokenData.height" value="${heightValue}" data-dtype="Number">
    </div>
    `;
  $(html).find('div.item-properties div.form-group').last().after(content);
  //addEditorHeadline(app, html, data);
  $(html)
    .find('.tab[data-tab=description] .editor')
    .prepend(
      `<h2 class="details-headline">${getGame().i18n.localize(`${PICK_UP_STIX_MODULE_NAME}.ItemDetailsHeadline`)}</h2>`,
    );
});
