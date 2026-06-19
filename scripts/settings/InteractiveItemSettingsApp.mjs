import { dbg } from "../utils/debugLog.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const MODULE_ID = "pick-up-stix";

export default class InteractiveItemSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pick-up-stix-interactive-item-settings",
    classes: ["pick-up-stix", "standard-form"],
    position: { width: 900, height: 850 },
    window: {
      title: "INTERACTIVE_ITEMS.Settings.InteractiveItemSettingsMenu.Name",
      icon: "fa-solid fa-box-open",
      resizable: true
    },
    tag: "form",
    form: {
      handler: InteractiveItemSettingsApp.#onSubmit,
      closeOnSubmit: true,
      submitOnChange: false
    }
  };

  static PARTS = {
    form: { template: "modules/pick-up-stix/templates/settings/interactive-item-settings.hbs" },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  async _prepareContext(options) {
    dbg("InteractiveItemSettingsApp:_prepareContext", "preparing context");
    const gs = (key) => game.settings.get(MODULE_ID, key);
    const folderId = gs("actorFolder");
    const currentFolder = folderId ? game.folders.get(folderId) : null;
    const folders = game.folders
      .filter(f => f.type === "Actor")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(f => ({ id: f.id, name: f.name, selected: f.id === folderId }));

    return {
      gmOverrideEnabled: gs("gmOverrideEnabled"),
      actorFolderValue: folderId,
      actorFolderName: currentFolder?.name ?? "",
      folders,
      folderColor: gs("folderColor") || "#000000",
      defaultContainerImage: gs("defaultContainerImage"),
      defaultContainerOpenImage: gs("defaultContainerOpenImage"),
      defaultInteractionRange: gs("defaultInteractionRange"),
      defaultInspectionRange: gs("defaultInspectionRange"),
      requireCtrlForDrag: gs("requireCtrlForDrag"),
      genericPickupItemType: gs("genericPickupItemType"),
      buttons: [{ type: "submit", icon: "fa-solid fa-save", label: "Save Settings" }]
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#wireActorFolderPicker();
  }

  #wireActorFolderPicker() {
    const form = this.element;
    const hidden = form.querySelector('input[name="actorFolder"]');
    const text = form.querySelector('.ii-folder-text');
    const select = form.querySelector('.ii-folder-select');
    if (!hidden || !text || !select) return;

    select.addEventListener("change", () => {
      if (select.value) {
        const folder = game.folders.get(select.value);
        text.value = folder?.name ?? "";
        hidden.value = select.value;
      }
    });

    text.addEventListener("input", () => {
      select.value = "";
      hidden.value = text.value;
    });
  }

  static async #onSubmit(event, form, formData) {
    dbg("InteractiveItemSettingsApp:submit", "saving settings");
    const d = formData.object;
    const ss = async (key, val) => game.settings.set(MODULE_ID, key, val);

    await ss("gmOverrideEnabled", !!d.gmOverrideEnabled);
    await ss("actorFolder", d.actorFolder ?? "");
    await ss("folderColor", d.folderColor ?? "");
    await ss("defaultContainerImage", d.defaultContainerImage ?? "");
    await ss("defaultContainerOpenImage", d.defaultContainerOpenImage ?? "");
    await ss("defaultInteractionRange", Number(d.defaultInteractionRange ?? 1));
    await ss("defaultInspectionRange", Number(d.defaultInspectionRange ?? 4));
    await ss("requireCtrlForDrag", !!d.requireCtrlForDrag);
    await ss("genericPickupItemType", d.genericPickupItemType ?? "");
  }
}
