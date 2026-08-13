import { MODULE_ID, getCatalogEntries, upsertCatalogEntry, updateCatalogPrice, deleteCatalogEntry, formatPrice } from '../data.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ShopCatalog extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: 'storeborne-catalog',
        tag: 'div',
        window: { title: 'SHOPMARKET.Catalog.Title', icon: 'fa-solid fa-book', resizable: true },
        position: { width: 560, height: 640 },
        actions: {
            removeEntry: ShopCatalog.#onRemoveEntry
        }
    };

    static PARTS = {
        body: { template: `modules/${MODULE_ID}/templates/shop-catalog.hbs` }
    };

    async _prepareContext() {
        const entries = getCatalogEntries()
            .map(e => ({ ...e, priceLabel: formatPrice(e.price ?? 0) }))
            .sort((a, b) => a.name.localeCompare(b.name));
        return { entries };
    }

    _onRender(context, options) {
        super._onRender?.(context, options);

        const dropZone = this.element.querySelector('.catalog-dropzone');
        dropZone?.addEventListener('dragover', ev => ev.preventDefault());
        dropZone?.addEventListener('drop', this.#onDrop.bind(this));

        for (const input of this.element.querySelectorAll('[data-entry-field="price"]')) {
            input.addEventListener('change', this.#onPriceChange.bind(this));
        }
    }

    async #onDrop(event) {
        event.preventDefault();
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        } catch {
            return;
        }

        if (data.type === 'Item') {
            const item = await fromUuid(data.uuid);
            if (!item) return;
            await upsertCatalogEntry(item, 1);
            ui.notifications.info(game.i18n.format('SHOPMARKET.Notif.CatalogItemAdded', { name: item.name }));
            this.render();
            return;
        }

        // Dragging a Folder (including a compendium folder) bulk-adds every Item inside it.
        if (data.type === 'Folder' && (data.documentName ?? 'Item') === 'Item') {
            const folder = await fromUuid(data.uuid);
            const items = (await folder?.getContents?.()) ?? [];
            if (!items.length) {
                ui.notifications.warn(game.i18n.localize('SHOPMARKET.Notif.NoItemsInFolder'));
                return;
            }
            for (const item of items) await upsertCatalogEntry(item, 1);
            ui.notifications.info(game.i18n.format('SHOPMARKET.Notif.CatalogBulkAdded', { count: items.length }));
            this.render();
            return;
        }

        if (data.type === 'Compendium' || data.pack) {
            const pack = game.packs.get(data.pack ?? data.id);
            if (!pack || pack.documentName !== 'Item') {
                ui.notifications.warn(game.i18n.localize('SHOPMARKET.Notif.DropItemOnly'));
                return;
            }
            const items = await pack.getDocuments();
            for (const item of items) await upsertCatalogEntry(item, 1);
            ui.notifications.info(game.i18n.format('SHOPMARKET.Notif.CatalogBulkAdded', { count: items.length }));
            this.render();
            return;
        }

        ui.notifications.warn(game.i18n.localize('SHOPMARKET.Notif.DropItemOnly'));
    }

    async #onPriceChange(event) {
        const input = event.currentTarget;
        const stackKey = input.closest('[data-stack-key]').dataset.stackKey;
        await updateCatalogPrice(stackKey, parseFloat(input.value) || 0);
        this.render();
    }

    static async #onRemoveEntry(event, target) {
        const stackKey = target.closest('[data-stack-key]').dataset.stackKey;
        await deleteCatalogEntry(stackKey);
        this.render();
    }
}