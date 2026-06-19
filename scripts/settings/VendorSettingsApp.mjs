import { dbg } from "../utils/debugLog.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const MODULE_ID = "pick-up-stix";

export default class VendorSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pick-up-stix-vendor-settings",
    classes: ["pick-up-stix", "standard-form"],
    position: { width: 600, height: 500 },
    window: {
      title: "INTERACTIVE_ITEMS.Settings.VendorSettingsMenu.Name",
      icon: "fa-solid fa-shop",
      resizable: true
    },
    tag: "form",
    form: {
      handler: VendorSettingsApp.#onSubmit,
      closeOnSubmit: true,
      submitOnChange: false
    }
  };

  static PARTS = {
    form: { template: "modules/pick-up-stix/templates/settings/vendor-settings.hbs" },
    footer: { template: "templates/generic/form-footer.hbs" }
  };

  async _prepareContext(options) {
    dbg("VendorSettingsApp:_prepareContext", "preparing context");
    const gs = (key) => game.settings.get(MODULE_ID, key);
    return {
      vendorFavorMax: gs("vendorFavorMax"),
      vendorFavorFactorMax: gs("vendorFavorFactorMax"),
      buttons: [{ type: "submit", icon: "fa-solid fa-save", label: "Save Settings" }]
    };
  }

  static async #onSubmit(event, form, formData) {
    dbg("VendorSettingsApp:submit", "saving vendor settings");
    const d = formData.object;
    const ss = async (key, val) => game.settings.set(MODULE_ID, key, val);

    await ss("vendorFavorMax", Number(d.vendorFavorMax ?? 5));
    await ss("vendorFavorFactorMax", Number(d.vendorFavorFactorMax ?? 20));
  }
}
