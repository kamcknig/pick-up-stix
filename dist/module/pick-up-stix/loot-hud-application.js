import { getLootToken } from "./main.js";
import { LootEmitLightConfigApplication } from "./loot-emit-light-config-application.js";
import { error, log } from "../../log.js";
import { SettingKeys } from "./settings.js";
export class LootHud extends BasePlaceableHUD {
    constructor() {
        super({});
        this.onPerceiveValueChanged = (e) => {
            log(`pick-up-stix | LootHudApplication ${this.appId} | onPerceivedValueChanged`);
            const val = +e.currentTarget.value;
            log([val]);
            if (val === undefined || val === null || isNaN(val)) {
                ui.notifications.error(`Invalid value '${val}'`);
                return;
            }
            if (val < 0) {
                ui.notifications.error(`Minimum perceived value must be 0`);
                return;
            }
            this.object.update({
                flags: {
                    'pick-up-stix': {
                        'pick-up-stix': {
                            minPerceiveValue: val
                        }
                    }
                }
            });
        };
        this.onConfigureLightEmission = async (event) => {
            log(`pick-up-stix | LootHud ${this.appId} | _onConfigureLightEmission`);
            const f = new LootEmitLightConfigApplication(this.object, {}).render(true);
        };
        this._onToggleItemLocked = async (event) => {
            log(`pick-up-stix | LootHud ${this.appId} | _onToggleItemLocked`);
            const lootToken = getLootToken({ itemId: this.itemId, tokenId: this.object.id })?.[0];
            if (!lootToken) {
                error(`No valid LootToken instance found for token '${this.object.id}' and Item id '${this.itemId}'`);
                return;
            }
            await lootToken.toggleLocked();
            this.render();
        };
        this.onTokenConfig = async (event) => {
            log(`pick-up-stix | LootHud ${this.appId} | _onTokenConfig`);
            const item = game.items.get(this.itemId);
            item.sheet.render(true, { renderData: { sourceToken: this.object.data._id } });
        };
        log(`pick-up-stix | LootHud ${this.appId} | constructor called with args`);
        log(LootHud.defaultOptions);
    }
    static get defaultOptions() {
        //@ts-ignore
        return mergeObject(super.defaultOptions, {
            height: 'auto',
            minimizable: false,
            id: 'loot-hud',
            resizable: false,
            template: 'modules/pick-up-stix/module/pick-up-stix/templates/loot-hud.html',
            classes: ['pick-up-stix', 'loot-hud'].concat(super.defaultOptions.classes)
        });
    }
    get itemId() {
        return this.object.getFlag('pick-up-stix', 'pick-up-stix.itemId');
    }
    activateListeners(html) {
        log(`pick-up-stix | LootHud ${this.appId} | activateListeners called with args`);
        log([html]);
        super.activateListeners(html);
        html.find(".config").click(this.onTokenConfig);
        html.find(".locked").click(this._onToggleItemLocked);
        html.find(".emit-light").click(this.onConfigureLightEmission);
        html.find(".visibility-perceive-input").on('change', this.onPerceiveValueChanged);
    }
    getData(options) {
        log(`pick-up-stix | LootHud ${this.appId} | getData`);
        const lootData = getLootToken({ itemId: this.itemId, tokenId: this.object.id })?.[0];
        ;
        if (!lootData) {
            error(`No valid LootToken instance found for token '${this.object.id}' on scene '${this.object.scene.id}'`);
        }
        const data = {
            canConfigure: game.user.can("TOKEN_CONFIGURE"),
            //@ts-ignore
            visibilityClass: this.object.data.hidden ? 'active' : '',
            //@ts-ignore
            lockedClass: this.object.data.locked ? 'active' : '',
            showPerceiveInput: game.settings.get('pick-up-stix', SettingKeys.enableLootTokenPerceiveReveal),
            minPerceiveValue: this.object.getFlag('pick-up-stix', 'pick-up-stix.minPerceiveValue') ?? game.settings.get('pick-up-stix', SettingKeys.defaultMinimumPerceiveValue),
            id: this.id,
            classes: this.options.classes.join(" "),
            appId: this.appId,
            isGM: game.user.isGM,
            icons: CONFIG.controlIcons
        };
        log([data]);
        return data;
    }
}

//# sourceMappingURL=../../maps/module/pick-up-stix/loot-hud-application.js.map
