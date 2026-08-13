import {
    MODULE_ID,
    getShop,
    getActorTotalHandfuls,
    setActorTotalHandfuls,
    addItemToActor,
    removeQuantityFromActorItem,
    getCatalog,
    findCatalogEntryForItem,
    formatGold,
    formatPrice,
    INVENTORY_ITEM_TYPES
} from '../data.js';
import { requestBuy, requestSell } from '../socket.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ShopView extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options) {
        super(options);
        this.shopId = options.shopId;
        this.actorId = options.actorId;
    }

    static DEFAULT_OPTIONS = {
        id: 'storeborne-view',
        tag: 'div',
        window: { title: 'SHOPMARKET.View.Title', icon: 'fa-solid fa-coins', resizable: true },
        position: { width: 780, height: 720 },
        actions: {
            buy: ShopView.#onBuy,
            sell: ShopView.#onSell
        }
    };

    static PARTS = {
        body: { template: `modules/${MODULE_ID}/templates/shop-view.hbs` }
    };

    get shop() {
        return getShop(this.shopId);
    }

    get actor() {
        return game.actors.get(this.actorId);
    }

    async _prepareContext() {
        const shop = this.shop;
        const actor = this.actor;
        const totalHandfuls = actor ? getActorTotalHandfuls(actor) : 0;

        const forSale = (shop?.inventory ?? [])
            .filter(e => e.unlimited || e.quantity > 0)
            .map(e => ({
                ...e,
                priceLabel: formatPrice(e.price ?? 0),
                affordable: totalHandfuls >= (e.price ?? 0)
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const catalog = getCatalog();
        const sellable = actor
            ? actor.items
                  .filter(i => INVENTORY_ITEM_TYPES.includes(i.type) && (i.system.quantity ?? 1) > 0)
                  .map(i => {
                      const entry = findCatalogEntryForItem(i, catalog);
                      return {
                          id: i.id,
                          name: i.name,
                          img: i.img,
                          quantity: i.system.quantity ?? 1,
                          sellable: !!entry,
                          priceLabel: entry ? formatPrice(entry.price ?? 0) : null
                      };
                  })
                  .sort((a, b) => a.name.localeCompare(b.name))
            : [];

        return {
            shop,
            actor,
            goldLabel: actor ? formatGold(actor.system.gold) : '—',
            forSale,
            sellable,
            sellEnabled: game.settings.get(MODULE_ID, 'sellEnabled')
        };
    }

    static async #onBuy(event, target) {
        const row = target.closest('[data-entry-id]');
        const entryId = row.dataset.entryId;
        const qtyInput = row.querySelector('.qty-input');
        const quantity = Math.max(1, parseInt(qtyInput?.value) || 1);

        const actor = this.actor;
        if (!actor) return ui.notifications.warn(game.i18n.localize('SHOPMARKET.Notif.NoActor'));

        const shop = this.shop;
        const entry = shop.inventory.find(e => e.id === entryId);
        if (!entry) return;

        const cost = (entry.price ?? 0) * quantity;
        const have = getActorTotalHandfuls(actor);
        if (have < cost) return ui.notifications.warn(game.i18n.localize('SHOPMARKET.Notif.CantAfford'));

        target.disabled = true;
        const result = await requestBuy({ shopId: this.shopId, entryId, quantity });
        target.disabled = false;

        if (!result.ok) {
            ui.notifications.warn(game.i18n.format('SHOPMARKET.Notif.BuyFailed', { reason: result.error }));
            this.render();
            return;
        }

        const totalCost = (result.price ?? 0) * quantity;
        await setActorTotalHandfuls(actor, getActorTotalHandfuls(actor) - totalCost);
        await addItemToActor(actor, result.entry, quantity);

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            title: shop.name,
            content: game.i18n.format('SHOPMARKET.Chat.Bought', {
                actor: actor.name,
                quantity,
                item: result.entry.name,
                shop: shop.name,
                price: formatPrice(totalCost)
            }),
            rolls: []
        });

        this.render();
    }

    static async #onSell(event, target) {
        const row = target.closest('[data-item-id]');
        const itemId = row.dataset.itemId;
        const qtyInput = row.querySelector('.qty-input');
        const actor = this.actor;
        if (!actor) return;

        const item = actor.items.get(itemId);
        if (!item) return;

        const maxQty = item.system.quantity ?? 1;
        const quantity = Math.min(maxQty, Math.max(1, parseInt(qtyInput?.value) || 1));

        target.disabled = true;
        const result = await requestSell({
            shopId: this.shopId,
            itemName: item.name,
            itemType: item.type,
            quantity
        });
        target.disabled = false;

        if (!result.ok) {
            ui.notifications.warn(game.i18n.format('SHOPMARKET.Notif.SellFailed', { reason: result.error }));
            this.render();
            return;
        }

        const totalValue = (result.price ?? 0) * quantity;
        await removeQuantityFromActorItem(item, quantity);
        await setActorTotalHandfuls(actor, getActorTotalHandfuls(actor) + totalValue);

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: game.i18n.format('SHOPMARKET.Chat.Sold', {
                actor: actor.name,
                quantity,
                item: item.name,
                shop: this.shop.name,
                price: formatPrice(totalValue)
            })
        });

        this.render();
    }
}