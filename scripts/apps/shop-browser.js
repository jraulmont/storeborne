import { MODULE_ID, getShops } from '../data.js';
import { ShopView } from './shop-view.js';
import { resolvePlayerActor, promptForActor } from '../util.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ShopBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: 'storeborne-browser',
        tag: 'div',
        window: { title: 'SHOPMARKET.Browser.Title', icon: 'fa-solid fa-coins' },
        position: { width: 420, height: 520 },
        actions: {
            openShop: ShopBrowser.#onOpenShop
        }
    };

    static PARTS = {
        body: { template: `modules/${MODULE_ID}/templates/shop-browser.hbs` }
    };

    async _prepareContext() {
        const shops = getShops()
            .filter(s => s.enabled || game.user.isGM)
            .sort((a, b) => a.name.localeCompare(b.name));
        return { shops };
    }

    static async #onOpenShop(event, target) {
        const shopId = target.closest('[data-shop-id]').dataset.shopId;
        let actor = resolvePlayerActor();
        if (!actor) actor = await promptForActor();
        if (!actor) return;
        new ShopView({ shopId, actorId: actor.id, id: `storeborne-view-${shopId}-${actor.id}` }).render(true);
    }
}
