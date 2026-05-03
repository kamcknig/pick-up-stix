import InteractiveModelMixin from "./InteractiveModelMixin.mjs";
import { dbg } from "../utils/debugLog.mjs";

const { TypeDataModel } = foundry.abstract;
const fields = foundry.data.fields;

export default class InteractiveItemModel extends InteractiveModelMixin(TypeDataModel) {

  static LOCALIZATION_PREFIXES = ["INTERACTIVE_ITEMS.Model"];

  prepareBaseData() {
    super.prepareBaseData();
    if (!this.parent.sourcedItems) {
      this.parent.sourcedItems = Object.assign(new Map(), { _redirectKeys() {} });
    }
  }

  static defineSchema() {
    return {
      description: new fields.HTMLField({ required: false, initial: "" }),
      isLocked: new fields.BooleanField({ initial: false }),
      lockedMessage: new fields.StringField({ required: false, initial: "" }),
      isOpen: new fields.BooleanField({ initial: false }),
      openImage: new fields.FilePathField({
        required: false,
        categories: ["IMAGE"],
        initial: null,
        nullable: true
      }),
      unidentifiedImage: new fields.FilePathField({
        required: false,
        categories: ["IMAGE"],
        initial: null,
        nullable: true
      }),
      interactionRange: new fields.NumberField({
        required: true,
        initial: 1,
        min: 0,
        step: 0.5
      }),
      inspectionRange: new fields.NumberField({
        required: true,
        initial: 4,
        min: 0,
        step: 0.5
      }),
      sourceItemUuid: new fields.StringField({ required: false, initial: "" }),
      unidentifiedName: new fields.StringField({ required: false, initial: "" }),
      unidentifiedDescription: new fields.HTMLField({ required: false, initial: "" }),
      limitedName: new fields.StringField({ required: false, initial: "" }),
      limitedDescription: new fields.HTMLField({ required: false, initial: "" })
    };
  }

  get isContainer() {
    return this.parent.items.some(i => i.type === "container");
  }

  get containerItem() {
    return this.parent.items.find(i => i.type === "container") ?? null;
  }

  get embeddedItem() {
    return this.containerItem ?? this.parent.items.contents[0] ?? null;
  }

  get isIdentified() {
    const item = this.embeddedItem;
    if (item?.system?.identified !== undefined) {
      return item.system.identified !== false;
    }
    return false;
  }

  get lockedDisplayMessage() {
    if (this.lockedMessage) return this.lockedMessage;
    const key = this.isContainer ? "INTERACTIVE_ITEMS.Notify.Locked" : "INTERACTIVE_ITEMS.Notify.ItemLocked";
    return game.i18n.localize(key);
  }

  get limitedDisplayName() {
    if (this.limitedName) return this.limitedName;
    if (this.isContainer) return game.i18n.localize("INTERACTIVE_ITEMS.Limited.DefaultContainerName");
    const embedded = this.embeddedItem;
    const typeKey = embedded?.type ? CONFIG.Item.typeLabels?.[embedded.type] : null;
    const typeLabel = typeKey ? game.i18n.localize(typeKey).toLowerCase() : game.i18n.localize("INTERACTIVE_ITEMS.Limited.DefaultItemTypeGeneric");
    return game.i18n.format("INTERACTIVE_ITEMS.Limited.DefaultItemName", { type: typeLabel });
  }

  get limitedDisplayDescription() {
    let body = this.limitedDescription || game.i18n.localize("INTERACTIVE_ITEMS.Limited.DefaultDescription");
    if (this.isContainer) {
      const stateKey = this.isOpen ? "INTERACTIVE_ITEMS.Limited.AppearsOpen" : "INTERACTIVE_ITEMS.Limited.AppearsClosed";
      const suffix = game.i18n.localize(stateKey);
      body = `${body}\n<p>${suffix}</p>`;
    }
    return body;
  }

  resolveImage(isIdentified) {
    const identified = isIdentified ?? this.isIdentified;
    const result = (!identified && this.unidentifiedImage) ? this.unidentifiedImage : this.parent.img;
    dbg("model:resolveImage", {
      actorName: this.parent?.name,
      passedIsIdentified: isIdentified,
      resolvedIsIdentified: identified,
      unidentifiedImage: this.unidentifiedImage,
      actorImg: this.parent?.img,
      result
    });
    return result;
  }

  async updateImage(path) {
    dbg("model:updateImage", {
      actorName: this.parent?.name,
      path,
      isIdentified: this.isIdentified,
      unidentifiedImage: this.unidentifiedImage
    });
    const updates = { img: path };
    if (this.isIdentified || !this.unidentifiedImage) {
      updates["prototypeToken.texture.src"] = path;
    }
    dbg("model:updateImage", "firing parent.update", { updates });
    return this.parent.update(updates);
  }
}
