import { MODULE_ID, registerSettings } from './data.js';
import { initSocket } from './socket.js';
import { ShopConfig } from './apps/shop-config.js';
import { ShopBrowser } from './apps/shop-browser.js';
import { ShopView } from './apps/shop-view.js';
import { ShopCatalog } from './apps/shop-catalog.js';
import { resolvePlayerActor, promptForActor } from './util.js';

Hooks.once('init', () => {
    registerSettings();
});

Hooks.once('ready', async () => {
    if (game.system.id !== 'daggerheart') {
        console.warn(`${MODULE_ID} | This module is built for the Daggerheart (foundryborne) system and may not work correctly here.`);
    }

    initSocket();

    const api = {
        openShopManager: () => new ShopConfig().render(true),
        openShopBrowser: () => new ShopBrowser().render(true),
        openShopCatalog: () => new ShopCatalog().render(true),
        openShop: async (shopId, actor) => {
            actor ??= resolvePlayerActor() ?? (await promptForActor());
            if (!actor) return;
            new ShopView({ shopId, actorId: actor.id, id: `storeborne-view-${shopId}-${actor.id}` }).render(true);
        }
    };
    game.modules.get(MODULE_ID).api = api;

    if (game.user.isGM) await ensureDefaultMacros(api);
});

Hooks.on('getSceneControlButtons', controls => {
    // Support both the legacy array-based API and the v13+ record-based API.
    const button = {
        name: 'storeborne-open',
        title: 'SHOPMARKET.Controls.Open',
        icon: 'fa-solid fa-coins',
        button: true,
        onClick: () => {
            const api = game.modules.get(MODULE_ID).api;
            game.user.isGM ? api.openShopManager() : api.openShopBrowser();
        }
    };

    const tokenGroup = Array.isArray(controls)
        ? controls.find(c => c.name === 'token')
        : controls.tokens ?? controls.token;

    if (!tokenGroup) return;

    if (Array.isArray(tokenGroup.tools)) tokenGroup.tools.push(button);
    else if (tokenGroup.tools) tokenGroup.tools[button.name] = { ...button, order: 100 };
});

async function ensureDefaultMacros(api) {
    const existing = game.macros.find(m => m.getFlag(MODULE_ID, 'default'));
    if (existing) return;

    await Macro.create({
        name: 'shops',
        type: 'script',
        img: 'icons/commodities/currency/coins-plain-stack-silver.webp',
        command: "game.modules.get('storeborne').api.openShopBrowser();",
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
        flags: { [MODULE_ID]: { default: true } }
    });

    const gmExisting = game.macros.find(m => m.getFlag(MODULE_ID, 'defaultGM'));
    if (!gmExisting) {
        await Macro.create({
            name: 'Manage Shops (GM)',
            type: 'script',
            img: 'icons/svg/chest.svg',
            command: "game.modules.get('storeborne').api.openShopManager();",
            ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
            flags: { [MODULE_ID]: { defaultGM: true } }
        });
    }
}