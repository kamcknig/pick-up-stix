//@ts-ignore
import { ItemData } from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/module.mjs';
import { i18n, log } from '../../main';
import { ItemType } from '../models';
import { getGame, PICK_UP_STIX_FLAG, PICK_UP_STIX_MODULE_NAME } from '../settings';

// export default function registerSheet(): void {
//   class ContainerItemApplicationSheet extends ItemSheet {
//     static get defaultOptions() {
//       return mergeObject(super.defaultOptions, {
//         classes: ['container', 'sheet', 'item'],
//       });
//     }

//     constructor(object: Item, options?: ItemSheet.Options) {
//       super(object, options);
//     }
//   }
// }

// let knownSheets = {};
// let templates = {};
let canAlwaysAddToBag;
let canAlwaysAddToBagTypes;

Hooks.once("ready", () => {
  canAlwaysAddToBag = i18n(PICK_UP_STIX_MODULE_NAME+".canAlwaysAddToBag");
  canAlwaysAddToBagTypes = i18n(PICK_UP_STIX_MODULE_NAME+".canAlwaysAddToBagTypes");
});

export class ContainerItemApplicationSheet extends ItemSheet {

  // item: any;
  options: any;
  constructor(object: Item, options?: ItemSheet.Options) {
    super(object, options);
    this.options.width = 570;
    this.options.height = 500;
    // this.item = args[0];
    //@ts-ignore only dnd5e has this property
    if(!this.item.items){
      //@ts-ignore
      this.item.items = {};
      setProperty(this.item, 'items',{});
    }
  }

  /** @override */  
  static get defaultOptions() {
    const options = super.defaultOptions;
    mergeObject(options, {
      width: 570,
      height: 500,
      //@ts-ignore
      showUnpreparedSpells: true,
      tabs: [{navSelector: ".tabs", contentSelector: ".sheet-body", initial: "details"}],
      classes: ['container', 'sheet', 'item'], // ADDED CONTAINER
    });
    return options;
  }

  /** @override */
  get template() {
    return `/modules/${PICK_UP_STIX_MODULE_NAME}/templates/container-sheet.html`;
  }

  //@ts-ignore
  render(...args) {
    super.render(...args);
  }
  //@ts-ignore
  async _onSubmit(event, {updateData={}, preventClose=false}={}) {
      super._onSubmit(event, {updateData, preventClose})
  }
  blankCurrency = {pp: 0, gp: 0, ep: 0, sp: 0, cp: 0};

  /** @override */
  async getData(options) {
    // const type = this.item.type;
  
    // if (!["backpack"].includes(type)) {
    //   ui.notifications?.error(i18n(PICK_UP_STIX_MODULE_NAME+".wrongType"))
    //   this.options.editable = false;
    //   options.editable = false;
    //   return super.getData(options);
    // };

    // const item = this.item;
    // const data:any = await super.getData(options);
    // data.flags = duplicate(item.data.flags);
    // // setProperty(data.flags.itemcollection, "contentsData", await this.item.getFlag(PICK_UP_STIX_MODULE_NAME, "contentsData"));

    // //@ts-ignore
    // data.currencies = Object.entries(CONFIG.DND5E.currencies).reduce((obj, [k, c]) => {
    //   //@ts-ignore
    //   obj[k] = c.label;
    //   return obj;
    // }, {});


    // if (!hasProperty(data.flags, PICK_UP_STIX_MODULE_NAME+".bagWeight"))
    //   setProperty(data.flags, PICK_UP_STIX_MODULE_NAME+".bagWeight", 0);
    // if (!hasProperty(data.flags, PICK_UP_STIX_MODULE_NAME+".goldValue"))
    //   setProperty(data.flags,PICK_UP_STIX_MODULE_NAME+".goldValue",  0);
    // if (!hasProperty(data.flags, PICK_UP_STIX_MODULE_NAME+".contentsData"))
    //   setProperty(data.flags,PICK_UP_STIX_MODULE_NAME+".contentsData", []);
    // if (!hasProperty(data.flags, PICK_UP_STIX_MODULE_NAME+".importSpells"))
    //   setProperty(data.flags,PICK_UP_STIX_MODULE_NAME+".importSpells", false);
    
    // //this.baseapps.options.editable = this.baseapps.options.editable// && (!this.item.actor || !this.item.actor.token);
    // data.hasDetails = true;
    // if (getGame().settings.get(PICK_UP_STIX_MODULE_NAME, "sortBagContents")) {
    //   data.flags[PICK_UP_STIX_MODULE_NAME].contentsData.sort((a,b) => {
    //     if (a.type === "spell" && b.type !== "spell") return 1;
    //     if (a.type !== "spell" && b.type === "spell") return -1;
    //     // if (a.type !== b.type) return (a.type < b.type ? -1 : 1);
    //     if (a.type !== "spell") return (a.name < b.name ? -1 : 1);
    //     if (a.data.level !== b.data.level) return (a.data.level - b.data.level);
    //     return a.name < b.name ? -1 : 1;
    //   });
    // }
    // data.isGM = getGame().user?.isGM;
    // //TODO check this out
    // for (const i of data.flags[PICK_UP_STIX_MODULE_NAME].contentsData){
    //   i.isBackpack = i.type === "backpack"
    //   i.isSpell = i.type === "spell";
    // }
    // data.canImportExport = item.parent !== undefined;
    // data.isOwned = item.parent !== undefined;
    // data.canConvertToGold = getGame().settings.get(PICK_UP_STIX_MODULE_NAME, 'goldConversion');
    // data.totalGoldValue = calcPrice(this.item);
    // data.itemsWeight = calcItemWeight(this.item);
    // data.weight = calcWeight(this.item);
    // // eslint-disable-next-line no-global-assign
    // parent = <any>this.item.parent;
    // data.parentName = "";
    // while (parent) {
    //   data.parentName += `<- ${parent.name} `
    //   // eslint-disable-next-line no-global-assign
    //   parent = parent.parent;
    // }
    // if (data.parentName.length > 0) data.parentName = `(${data.parentName})`
    
    // return data;
    const type = this.item.data.type;

    if (!["backpack"].includes(type)) {
      ui.notifications?.error(i18n(PICK_UP_STIX_MODULE_NAME+".wrongType"))
      this.options.editable = false;
      return super.getData(options);
    };
  

    // this._sheetTab="details"

    const item = this.item;
    const data:any = await super.getData(options);
    data.flags = duplicate(item.data.flags); // ADDED CONTAINER
    if (!hasProperty(data.flags, PICK_UP_STIX_MODULE_NAME+".markup"))
      setProperty(data.flags,PICK_UP_STIX_MODULE_NAME+".markup", 10);

    const markup = (getProperty(data.flags,PICK_UP_STIX_MODULE_NAME+".markup") || 0) / 100;
    const nameFilter = null; // REMOVED CONTAINER item.data.flags[PICK_UP_STIX_MODULE_NAME].nameFilter;
    if(hasProperty(data.flags, PICK_UP_STIX_MODULE_NAME+".contentsData")){
      for (let i = 0; i < data.flags[PICK_UP_STIX_MODULE_NAME].contentsData.length; i++) {
        const itemData = data.flags[PICK_UP_STIX_MODULE_NAME].contentsData[i];
        itemData.display = !nameFilter || (itemData.name.toLocaleLowerCase().includes(nameFilter))
        if (!itemData.data.price)
          itemData.data.marketPrice = "";
        else
          itemData.data.marketPrice = Math.ceil((itemData.data.price ?? 0) * (1+markup) * 100) / 100;
        if (itemData.data.marketPrice > 10) itemData.data.marketPrice = Math.ceil(itemData.data.marketPrice)
      }
    }

    //this.baseapps.options.editable = this.baseapps.options.editable// && (!this.item.actor || !this.item.actor.token);
    return data;
  }


  async _onDragItemStart(event) {
    event.stopPropagation();
    if(getGame().user?.isGM){
      const items = this.item.getFlag(PICK_UP_STIX_MODULE_NAME, "contents");
      const itemId = event.currentTarget.dataset.itemId;
      //@ts-ignore only dnd5e has this property
      const item = this.item.items.get(itemId);
      event.dataTransfer.setData("text/plain", JSON.stringify({
        type: "Item",
        data: item
      }));
      await this.item.deleteEmbeddedDocuments("Item", [itemId]);
      //this.render(false);
    }
  }

  canAdd(itemData) {
    return true;
    // // Check that the item is not too heavy for the bag.
    // const bagCapacity = this.item.data.data.capacity.value;
    // if (bagCapacity === 0) return true;
    // if (canAlwaysAddToBagTypes.some(name=>itemData.name.includes(name))) return true;
    // if (canAlwaysAddToBag.includes(itemData.name)) return true;

    // const itemQuantity = itemData.data.quantity || 1;
    // if (this.item.data.data.capacity.type === "items") {
    //   const itemCount = this.item.containedItemCount()
    //   return itemCount + itemQuantity <= bagCapacity;
    // }
    // const newWeight = this.item.calcItemWeight({ignoreItems: canAlwaysAddToBag, ignoreTypes: canAlwaysAddToBagTypes  }) + (itemData.data.weight ?? 0) * itemQuantity;
    // return bagCapacity >= newWeight;
  }

  async _onDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
      if ( data.type !== "Item" ) {
        console.log("ItemCollection | Bags only accept items");
        return false;
      }
    }
    catch (err) {
      console.log("ItemCollection | drop error")
      console.log(event.dataTransfer.getData('text/plain'));
      console.log(err);
      return false;
    }
    // Case 1 - Data explicitly provided
    let actor = getGame().actors?.get(data.actorId);
    
    if (data.tokenId) {
      const uuid = `Scene.${data.sceneId}.Token.${data.tokenId}`;
      const tokenDocument = await fromUuid(uuid);
      //@ts-ignore .actor
      if (tokenDocument) actor = tokenDocument.actor;
    }
    if ( data.data ) {
      // Check up the chain that we are not dropping one of our parents onto us.
      let canAdd = this.item.id !== data.data._id;
      // eslint-disable-next-line no-global-assign
      parent = <any>this.item.parent;
      let count = 0;
      while (parent && count < 10) { // Don't allow drops of anything in the parent chain or the item will disappear.
        count += 1;
        //@ts-ignore parent.id
        canAdd = canAdd && (parent.id !== data.data._id);
        // eslint-disable-next-line no-global-assign
        parent = parent.parent;
      }
      if (!canAdd) {
        console.log("ItemCollection | Cant drop on yourself");
        ui.notifications?.info(i18n('itemcollection.ExtradimensionalVortex'));
        throw new Error("Dragging bag onto istelf or ancestor opens a planar vortex and you are sucked into it")
      }
      // drop from player characters or another bag.
      if (this.canAdd(data.data)) {
          // will fit in the bag so add it to the bag and delete from the owning actor if there is one.
          const toDelete = data.data._id;
          await this.item.createEmbeddedDocuments("Item", [data.data]);
          //@ts-ignore deleteEmbeddedDocuments
          if (actor && (actor.data.type === "character" || actor.isToken)) await actor.deleteEmbeddedDocuments("Item", [toDelete]);
          return false;
      }
      // Item will not fit in the bag what to do?
      else if (this.item.parent) { // this bag is owned by an actor - drop into the inventory instead.
          //@ts-ignore
          if (actor && actor.data.type === "character") await actor.deleteEmbeddedDocuments("Item", [data.data._id]);
          await this.item.parent.createEmbeddedDocuments("Item", [data.data]);
          ui.notifications?.info(i18n('itemcollection.AlternateDropInInventory'));
          return false;
      }
      // Last resort accept the drop anyway so that the item wont disappear.
      else if (!actor) await this.item.createEmbeddedDocuments("Item", [data.data]); 
    }

    // Case 2 - Import from a Compendium pack
    else if ( data.pack ) {
      this._importItemFromCollection(data.pack, data.id);
    }

    // Case 3 - Import from World entity
    else {
      const item = <Item>getGame().items?.get(data.id);
      if (this.canAdd(item.data)) { // item will fit in the bag
        //@ts-ignore toJSON
        const itemData = item.data.toJSON();
        await this.item.createEmbeddedDocuments("Item", [itemData]);
      } else {
        console.log(`ItemCollection | no room in bag for dropped item`);
        ui.notifications?.info(i18n('itemcollection.NoRoomInBag'));
      }
    }
    return false;
  }

  async _importItemFromCollection(collection, entryId) {
    //@ts-ignore
    const item = await getGame().packs.get(collection).getDocument(entryId);
    if (!item) return;
    //@ts-ignore toJSON
    return this.item.createEmbeddedDocuments("Item", item.data.toJSON())
  }


  async _itemExport(event) { 
    // don't allow exporting for shops
    event.stopPropagation();
    // return true;
    // no exporting for shops

    // const li = $(event.currentTarget).parents(".item");
    // const id = li.attr("data-item-id");
    // if (!this.item.parent) return;
    // //@ts-ignore
    // const item = this.item.items.get(id);
    // if (!item) {
    //   console.error(`Item ${id} not found`)
    // }
    // Hooks.once("updateItem", () => {
    //   this.item.parent?.createEmbeddedDocuments("Item", [item.data.toJSON()])
    // });
    // await this.item.deleteEmbeddedDocuments("Item", [item.id])
    // this.render();
  }

  async _itemSplit(event) {
    const li = $(event.currentTarget).parents(".item");
    const id = <string>li.attr("data-item-id");
    const item = <Item>await this.item.getEmbeddedDocument("Item", id);
    return;
    // REMOVED FOR CONTAINER
    // if (item.type === "backpack") return; //can't split a bag
    // if (item.data.data.quantity < 2) return; // not enough to split
    // const itemData = item.data.toJSON();
    // const newQuantity = Math.floor(item.data.data.quantity / 2);
    // // item.data.data.quantity -= newQuantity;
    // itemData.data.quantity = newQuantity;
    // Hooks.once("updateItem", () => this.item.createEmbeddedDocuments("Item", [itemData]));
    // await item.update({"data.quantity": item.data.data.quantity - newQuantity})
  }

  async _itemConvertToGold(event) {
    if (!getGame().settings.get(PICK_UP_STIX_MODULE_NAME, 'goldConversion')) return;
    const li = $(event.currentTarget).parents(".item");
    const id = <string>li.attr("data-item-id");
    const item = <Item>await this.item.getEmbeddedDocument("Item", id);
    if (!item) return; // should not happen
    const goldValue = calcPrice(item);
    if (goldValue <= 0) return;
    //@ts-ignore
    const currency = duplicate(this.item.data.data.currency);
    currency.gp = currency.gp + Math.round((goldValue * <number>getGame().settings.get(PICK_UP_STIX_MODULE_NAME, 'goldConversionPercentage') / 100) * 100) / 100;
    Hooks.once("updateItem", () => this.item.update({"data.currency": currency}))
    // remove the item
    await item.delete();
    return 
  }

  // since diffObject balks on arrays need to do a deeper compare
  object_equals( x, y ) {
  if ( x === y ) return true;
    // if both x and y are null or undefined and exactly the same

  if ( ! ( x instanceof Object ) || ! ( y instanceof Object ) ) return false;
    // if they are not strictly equal, they both need to be Objects

  if ( x.type !== y.type ) return false;

  for ( const p in x ) {
    if (p === "quantity") continue; // ignore quantity
    // eslint-disable-next-line no-prototype-builtins
    if ( ! x.hasOwnProperty( p ) ) continue;
      // other properties were tested using x.constructor === y.constructor
    // eslint-disable-next-line no-prototype-builtins
    if ( ! y.hasOwnProperty( p ) ) return false;
      // allows to compare x[ p ] and y[ p ] when set to undefined

    if ( x[ p ] === y[ p ] ) continue;
  
      // if they have the same strict value or identity then they are equal

    if ( typeof( x[ p ] ) !== "object" ) return false;
      // Numbers, Strings, Functions, Booleans must be strictly equal

    if ( ! this.object_equals( x[ p ],  y[ p ] ) ) return false;
      // Objects and Arrays must be tested recursively
  }

  for (const p in y )
    // eslint-disable-next-line no-prototype-builtins
    if ( y.hasOwnProperty( p ) && ! x.hasOwnProperty( p ) )
      return false;
        // allows x[ p ] to be set to undefined

  return true;
}

  async _compactAll() {
    const items = <ItemData[]>duplicate(this.item.getFlag(PICK_UP_STIX_MODULE_NAME, "contentsData"));
    const mergedItems:any = {};
    const keptItems:any = [];
    for (const itemData of items) {
      //@ts-ignore
      if (!itemData.flags.itemcollection?.contentsData) {
        let canMerge = false;
        if (mergedItems[itemData.name]) {
          // let diffs = Object.keys(diffObject(mergedItems[itemData.name].data, itemData.data));
          // canMerge = (diffs.length === 0) || (diffs.length === 1 && diffs[0] === "quantity")
          // TODO consideer if we need to include flags & effects in the compare.
          canMerge = this.object_equals(mergedItems[itemData.name].data,itemData.data);
        };
        if (mergedItems[itemData.name] && canMerge) {
          const oldQ = parseInt(mergedItems[itemData.name].data.quantity);
          //@ts-ignore
          const increment = parseInt(itemData.data.quantity || 1);
          if (mergedItems[itemData.name].data.quantity) mergedItems[itemData.name].data.quantity = oldQ + increment;
        } else if (mergedItems[itemData.name]) { // we would like to merge but can't
          keptItems.push(itemData);
        } else {
          mergedItems[itemData.name] = itemData;
        }
      } else{
        keptItems.push(itemData);
      }
    }
    const newItems = Object.values(mergedItems).concat(keptItems);
    const toDelete = items.map((i:ItemData)=>i._id);
    //@ts-ignore
    Hooks.once("updateItem", () => {
      //@ts-ignore
      this.item.deleteEmbeddedDocuments("Item", toDelete);
    });
    //@ts-ignore
    return this.item.createEmbeddedDocuments("Item", newItems)
  }

  async _exportAll(event) {
    event.stopPropagation();
    //return false;
    // if (!isNewerVersion(getGame().data.version, "0.8.9")) {
    //   ui.notifications?.warn("Disabled due to bugs - use drag and drop or single item export");
    //   return;
    // }
    // if (!this.item.parent) return;
    // if (this.item.items.length === 0) return;
    // const itemsData = duplicate(getProperty(this.item.data.flags, "itemcollection.contentsData") ?? []);
    // const toDelete = itemsData.map(idata => idata._id);
    // await this.item.parent.createEmbeddedDocuments("Item", itemsData);
    // //@ts-ignore
    // await this.updateParentCurrency(this.item.data.data.currency);
    // await this.item.deleteEmbeddedDocuments("Item", toDelete)
    // // this.render(true);
  }

  update(data,options) {
    //ev.stopPropagation();
    this.item.update(data, options)
  }

  getParentCurrency() {
    if (!this.item.parent) return;
    //@ts-ignore
    return this.item.parent.data.data.currency;
  }

  async setParentCurrency(currency) {
    if (!this.item.parent) return;
    this.item.parent.update({"data.currency": currency});
  }
  async updateParentCurrency(addedCurrency) {
    const existingCurrency = this.getParentCurrency();
    // TODO add the currencies together
    const newCurrency = duplicate(this.blankCurrency);

    for (const key of Object.keys(this.blankCurrency)) {
      newCurrency[key] = (addedCurrency[key] ?? 0) + (existingCurrency[key] ?? 0);
    }
    Hooks.once("updateItem", () => {
      this.setParentCurrency(newCurrency);
    })
    await this.item.update({"data.currency": this.blankCurrency})
  }

  async _editItem(event) {
    if (!getGame().user?.isGM) return;
    // super._editItem(event);
    const li = $(event.currentTarget).parents(".item");
    const id = li.attr("data-item-id");
    //@ts-ignore
    const item = this.item.items.get(id);
    if (!item) throw new Error(`Item ${id} not found in Bag ${this.item._id}`);
    // let item = this.items[idx];
    item.sheet.render(true);
    return;
  }

  _onItemSummary(event) {
    event.stopPropagation();
    return;
    // return;
    // event.preventDefault();
    // let li = $(event.currentTarget).parents(".item"),
    //     item = this.item.items.get(li.data("item-id")),
    //     chatData = item.getChatData({secrets: getGame().user.isGM});

    //   // Toggle summary
    //   if ( li.hasClass("expanded") ) {
    //     let summary = li.children(".item-summary");
    //     summary.slideUp(200, () => summary.remove());
    //   } else {
    //     let div = $(`<div class="item-summary">${chatData.description.value}</div>`);
    //     let props = $(`<div class="item-properties"></div>`);
    //     chatData.properties.forEach(p => props.append(`<span class="tag">${p}</span>`));
    //     div.append(props);
    //     li.append(div.hide());
    //     div.slideDown(200);
    //   }
    //   li.toggleClass("expanded");
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Everything below is only needed if the sheet is editable
    if ( !this.options.editable ) return;

    html.find("input").focusout(this._onUnfocus.bind(this));

    // Delete Inventory Item
    html.find('.item-delete').off().click(ev => {
      if (getGame().user?.isGM) {
        const li = $(ev.currentTarget).parents(".item"),
        itemId = <string>li.attr("data-item-id");
        this.item.deleteEmbeddedDocuments("Item", [itemId]);
      }
    });
  //   super.activateListeners(html);

  //   // Everything below is only needed if the sheet is editable
  //   if ( !this.options.editable ) return;
  //   // Make the Actor sheet droppable for Items if it is not owned by a token or npc
  //   if (this.item.type === "backpack" /*|| this.item.type === "loot"*/) {
  //     //@ts-ignore TODO fix this
  //       this.form.ondragover = ev => this._onDragOver(ev);
  //     //@ts-ignore
  //     this.form.ondrop = ev => this._onDrop(ev);

  //       html.find('.item').each((i, li) => {
  //         li.setAttribute("draggable", true);
  //         li.addEventListener("dragstart", this._onDragItemStart.bind(this), false);
  //       });

  //       document.addEventListener("dragend", this._onDragEnd.bind(this));
  //       // html[0].ondragend = this._onDragEnd.bind(this);
  //       html.find('.item .item-name.rollable h4').click(event => this._onItemSummary(event));
  //   }

  //   html.find("input").focusout(this._onUnfocus.bind(this));

  //     // Delete Inventory Item
  //   html.find('.item-delete').click(async ev => {
  //     let li = $(ev.currentTarget).parents(".item"),
  //     itemId = li.attr("data-item-id");
  //     await this.item.deleteEmbeddedDocuments("Item", [itemId]);
  //     this.render();
  //   });

  //   html.find('.item-edit').click(ev => this._editItem(ev));
  //   html.find('.item-export-all').click(ev => this._exportAll(event));
  //   html.find('.item-export').click(ev => this._itemExport(ev));
  //   html.find('.item-compact-all').click(ev => this._compactAll());
  //   html.find('.item-import-all').click(ev => this._importAllItemsFromParent(this.item.parent));
  //   html.find('.item-split').click(ev => this._itemSplit(ev));
  //   html.find('.item-convertToGold').click(ev => this._itemConvertToGold(ev));
  //   html.find('.item .item-name h4').click(event => this._onItemSummary(event));
  // //  html.find('.bag-equipped').click(ev => this._toggleEquipped(ev));
  }

  async _importAllItemsFromParent(parent) {
    if (!isNewerVersion(getGame().data.version, "0.8.9")) {
      ui.notifications?.warn("Disabled due to bugs - use drag and drop");
      return;
    }
    if (!parent) return;
    const itemsToImport:any[] = [];
    for (const testItem of parent.items) {
      if (["weapon", "equipment", "consumable", "tool", "loot", "spell"].includes(testItem.type))
        itemsToImport.push(testItem.data.toJSON());
    }
    const itemsToDelete = itemsToImport.map(itemData => itemData._id);
    await this.item.createEmbeddedDocuments("Item", itemsToImport);
    await parent.deleteEmbeddedDocuments("Item", itemsToDelete);

    this.render();
  }

  _onDragEnd(event) {
    event.stopPropagation()
    if (getGame().user?.isGM) {
      //super._onDragEnd(event);
      event.preventDefault(); // Added shop
    }
    return false;
    // event.preventDefault();
    // return false;
  }
  _onDragOver(event) {
    event.preventDefault();
    return false;
  }

  _onUnfocus(event) {
    //@ts-ignore
    this._submitting = true;
    setTimeout(() => {
      const hasFocus = $(":focus").length;
      if ( !hasFocus ) {
        this._onSubmit(event);
      }
      //@ts-ignore
      this._submitting = false;
    }, 25);
  }
}

export function calcPrice(item:Item) {
  //@ts-ignore
  if (item.type !== "backpack" || item.items === undefined) return _calcItemPrice(item);
  //@ts-ignore
  const currency = item.data.data.currency ?? {};
  const coinValue =  currency ? Object.keys(currency)
      //@ts-ignore
      .reduce((val, denom) => val += {"pp" :10, "gp": 1, "ep": 0.5, "sp": 0.1, "cp": 0.01}[denom] * currency[denom], 0) : 0;
  //@ts-ignore
  const price = item.items.reduce((acc, item) => acc + (item.calcPrice() ?? 0), _calcItemPrice(item) || 0);
  return Math.round((price + coinValue) * 100) / 100;
}

export function _calcItemPrice(item) {
  if (item.type === "backpack") return item.data.flags.itemcollection?.bagPrice ?? 0;
  const quantity = item.data.data.quantity || 1;
  const price = item.data.data.price || 0;
  return Math.round(price * quantity * 100) / 100;
}

// Hooks.on('renderContainerItemApplicationSheet', (app, protoHtml, data) => {
//   log(`renderContainerItemApplicationSheet`);
//   log([app, protoHtml, data]);

//   const item: Item = app.object;

//   // can't edit the size of owned items
//   if (item.actor) return;

//   let html = protoHtml;

//   if (html[0].localName !== 'div') {
//     html = $(html[0].parentElement.parentElement);
//   }
//   const flagValue = (<any>item.getFlag(PICK_UP_STIX_MODULE_NAME, PICK_UP_STIX_FLAG))?.tokenData;
//   const widthValue = flagValue?.width ?? 1; // ${item.data.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.width ?? 1}
//   const heightValue = flagValue?.height ?? 1; // ${item.data.flags?.['pick-up-stix']?.['pick-up-stix']?.tokenData?.height ?? 1}
//   const content = `
//     <div class="form-group">
//       <label>Width</label>
//       <input type="text" name="flags.pick-up-stix.pick-up-stix.tokenData.width" value="${widthValue}" data-dtype="Number">
//     </div>

//     <div class="form-group">
//       <label>Height</label>
//       <input type="text" name="flags.pick-up-stix.pick-up-stix.tokenData.height" value="${heightValue}" data-dtype="Number">
//     </div>
//     `;
//   $(html).find('div.item-properties div.form-group').last().after(content);
//   //addEditorHeadline(app, html, data);
//   $(html)
//     .find('.tab[data-tab=description] .editor')
//     .prepend(
//       `<h2 class="details-headline">${getGame().i18n.localize(`${PICK_UP_STIX_MODULE_NAME}.ItemDetailsHeadline`)}</h2>`,
//     );
// });
