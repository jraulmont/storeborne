import { MODULE_ID, getShops, upsertShop, deleteShop, makeEmptyShop } from '../data.js';
import { ShopEditor } from './shop-editor.js';
import { ShopView } from './shop-view.js';
import { ShopCatalog } from './shop-catalog.js';
import { resolvePlayerActor, promptForActor } from '../util.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ShopConfig extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: 'storeborne-config',
        tag: 'div',
        window: { title: 'SHOPMARKET.Config.Title', icon: 'fa-solid fa-coins', resizable: true },
        position: { width: 560, height: 640 },
        actions: {
            createShop: ShopConfig.#onCreateShop,
            editShop: ShopConfig.#onEditShop,
            previewShop: ShopConfig.#onPreviewShop,
            toggleShop: ShopConfig.#onToggleShop,
            deleteShop: ShopConfig.#onDeleteShop,
            openSettings: ShopConfig.#onOpenSettings,
            openCatalog: ShopConfig.#onOpenCatalog
        }
    };

    static PARTS = {
        body: { template: `modules/${MODULE_ID}/templates/shop-config.hbs` }
    };

    async _prepareContext() {
        return { shops: getShops().sort((a, b) => a.name.localeCompare(b.name)) };
    }

    static async #onCreateShop() {
        const shop = makeEmptyShop();
        await upsertShop(shop);
        new ShopEditor({ shopId: shop.id, id: `storeborne-editor-${shop.id}` }).render(true);
        this.render();
    }

    static #onEditShop(event, target) {
        const shopId = target.closest('[data-shop-id]').dataset.shopId;
        new ShopEditor({ shopId, id: `storeborne-editor-${shopId}` }).render(true);
    }

    static async #onPreviewShop(event, target) {
        const shopId = target.closest('[data-shop-id]').dataset.shopId;
        let actor = resolvePlayerActor();
        if (!actor) actor = await promptForActor();
        if (!actor) return;
        new ShopView({ shopId, actorId: actor.id, id: `storeborne-view-${shopId}-${actor.id}` }).render(true);
    }

    static async #onToggleShop(event, target) {
        const shopId = target.closest('[data-shop-id]').dataset.shopId;
        const shop = getShops().find(s => s.id === shopId);
        shop.enabled = !shop.enabled;
        await upsertShop(shop);
        this.render();
    }

    static async #onDeleteShop(event, target) {
        const shopId = target.closest('[data-shop-id]').dataset.shopId;
        const shop = getShops().find(s => s.id === shopId);
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize('SHOPMARKET.Config.DeleteTitle') },
            content: `<p>${game.i18n.format('SHOPMARKET.Config.DeleteConfirm', { name: shop.name })}</p>`
        });
        if (!confirmed) return;
        await deleteShop(shopId);
        this.render();
    }

    static #onOpenSettings() {
        game.settings.sheet.render(true);
    }

    static #onOpenCatalog() {
        new ShopCatalog().render(true);
    }
}