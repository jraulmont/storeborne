import {
    MODULE_ID,
    getShop,
    upsertShop,
    generateShopInventory,
    addDirectItemToShop,
    formatPrice,
    getCatalog,
    buildStackKey
} from '../data.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ShopEditor extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options) {
        super(options);
        this.shopId = options.shopId;
    }

    static DEFAULT_OPTIONS = {
        id: 'storeborne-editor',
        tag: 'form',
        window: { title: 'SHOPMARKET.Editor.Title', icon: 'fa-solid fa-coins', resizable: true },
        position: { width: 700, height: 780 },
        form: { handler: ShopEditor.#onSubmit, submitOnChange: true, closeOnSubmit: false },
        actions: {
            pickImage: ShopEditor.#onPickImage,
            removeTable: ShopEditor.#onRemoveTable,
            generate: ShopEditor.#onGenerate,
            clearInventory: ShopEditor.#onClearInventory,
            removeEntry: ShopEditor.#onRemoveEntry
        }
    };

    static PARTS = {
        body: { template: `modules/${MODULE_ID}/templates/shop-editor.hbs` }
    };

    get shop() {
        return getShop(this.shopId);
    }

    async _prepareContext() {
        const shop = this.shop;
        const tables = [];
        for (const uuid of shop.rollTableUuids ?? []) {
            const table = await fromUuid(uuid);
            tables.push({ uuid, name: table?.name ?? '(missing table)' });
        }
        const catalog = getCatalog();
        const inventory = (shop.inventory ?? [])
            .map(e => ({ ...e, priceLabel: formatPrice(e.price ?? 0), inCatalog: !!catalog[e.stackKey] }))
            .sort((a, b) => a.name.localeCompare(b.name));
        return { shop, tables, inventory };
    }

    _onRender(context, options) {
        super._onRender?.(context, options);
        const dropZone = this.element.querySelector('.table-dropzone');
        dropZone?.addEventListener('dragover', ev => ev.preventDefault());
        dropZone?.addEventListener('drop', this.#onDropTable.bind(this));

        const invZone = this.element.querySelector('.inventory-dropzone');
        invZone?.addEventListener('dragover', ev => ev.preventDefault());
        invZone?.addEventListener('drop', this.#onDropItem.bind(this));

        for (const input of this.element.querySelectorAll('[data-entry-field]')) {
            input.addEventListener('change', this.#onEntryFieldChange.bind(this));
        }
    }

    async #onDropTable(event) {
        event.preventDefault();
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        } catch {
            return;
        }
        if (data.type !== 'RollTable') {
            ui.notifications.warn(game.i18n.localize('SHOPMARKET.Notif.DropRollTableOnly'));
            return;
        }
        const uuid = data.uuid;
        const shop = this.shop;
        if (!shop.rollTableUuids.includes(uuid)) shop.rollTableUuids.push(uuid);
        await upsertShop(shop);
        this.render();
    }

    async #onDropItem(event) {
        event.preventDefault();
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        } catch {
            return;
        }
        if (data.type !== 'Item') {
            ui.notifications.warn(game.i18n.localize('SHOPMARKET.Notif.DropItemOnly'));
            return;
        }
        const item = await fromUuid(data.uuid);
        if (!item) return;
        const shop = this.shop;
        const catalog = getCatalog();
        const price = catalog[buildStackKey(item)]?.price ?? 1;
        addDirectItemToShop(shop, item, 1, price);
        await upsertShop(shop);
        this.render();
    }

    async #onEntryFieldChange(event) {
        const input = event.currentTarget;
        const entryId = input.closest('[data-entry-id]').dataset.entryId;
        const field = input.dataset.entryField;
        const shop = this.shop;
        const entry = shop.inventory.find(e => e.id === entryId);
        if (!entry) return;

        if (field === 'unlimited') entry.unlimited = input.checked;
        else if (field === 'quantity') entry.quantity = Math.max(0, parseInt(input.value) || 0);
        else if (field === 'price') entry.price = Math.max(0, parseFloat(input.value) || 0);

        await upsertShop(shop);
        this.render();
    }

    static async #onSubmit(event, form, formData) {
        const shop = this.shop;
        const data = foundry.utils.expandObject(formData.object);
        shop.name = data.name?.trim() || shop.name;
        shop.img = data.img || shop.img;
        shop.description = data.description ?? shop.description;
        shop.rollCount = Math.max(1, parseInt(data.rollCount) || 1);
        shop.allowDuplicates = !!data.allowDuplicates;
        shop.enabled = !!data.enabled;
        await upsertShop(shop);
        this.render();
    }

    static async #onPickImage() {
        const shop = this.shop;
        const FP = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
        const picker = new FP({
            type: 'image',
            current: shop.img,
            callback: async path => {
                shop.img = path;
                await upsertShop(shop);
                this.render();
            }
        });
        picker.render(true);
    }

    static async #onRemoveTable(event, target) {
        const uuid = target.closest('[data-uuid]').dataset.uuid;
        const shop = this.shop;
        shop.rollTableUuids = shop.rollTableUuids.filter(u => u !== uuid);
        await upsertShop(shop);
        this.render();
    }

    static async #onGenerate() {
        let shop = this.shop;
        if (!shop.rollTableUuids?.length) {
            ui.notifications.warn(game.i18n.localize('SHOPMARKET.Notif.NoTablesConfigured'));
            return;
        }
        shop = await generateShopInventory(shop);
        await upsertShop(shop);
        ui.notifications.info(game.i18n.localize('SHOPMARKET.Notif.InventoryGenerated'));
        this.render();
    }

    static async #onClearInventory() {
        const shop = this.shop;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize('SHOPMARKET.Editor.ClearInventoryTitle') },
            content: `<p>${game.i18n.localize('SHOPMARKET.Editor.ClearInventoryConfirm')}</p>`
        });
        if (!confirmed) return;
        shop.inventory = [];
        await upsertShop(shop);
        this.render();
    }

    static async #onRemoveEntry(event, target) {
        const entryId = target.closest('[data-entry-id]').dataset.entryId;
        const shop = this.shop;
        shop.inventory = shop.inventory.filter(e => e.id !== entryId);
        await upsertShop(shop);
        this.render();
    }
}