export const MODULE_ID = 'storeborne';
export const SOCKET = `module.${MODULE_ID}`;

export const SETTINGS = {
    shops: 'shops',
    catalog: 'catalog',
    returnSoldItems: 'returnSoldItems',
    sellEnabled: 'sellEnabled'
};

export const INVENTORY_ITEM_TYPES = ['loot'];

export function registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.shops, {
        scope: 'world',
        config: false,
        type: Array,
        default: []
    });

    game.settings.register(MODULE_ID, SETTINGS.catalog, {
        scope: 'world',
        config: false,
        type: Object,
        default: {}
    });

    game.settings.register(MODULE_ID, SETTINGS.returnSoldItems, {
        name: 'SHOPMARKET.Settings.ReturnSoldItems.Name',
        hint: 'SHOPMARKET.Settings.ReturnSoldItems.Hint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE_ID, SETTINGS.sellEnabled, {
        name: 'SHOPMARKET.Settings.SellEnabled.Name',
        hint: 'SHOPMARKET.Settings.SellEnabled.Hint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });
}

export function getShops() {
    return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.shops));
}

export function getShop(shopId) {
    return getShops().find(s => s.id === shopId) ?? null;
}

export async function saveShops(shops) {
    if (!game.user.isGM) throw new Error('Only the GM can write shop data.');
    await game.settings.set(MODULE_ID, SETTINGS.shops, shops);
    return shops;
}

export async function upsertShop(shop) {
    const shops = getShops();
    const idx = shops.findIndex(s => s.id === shop.id);
    if (idx >= 0) shops[idx] = shop;
    else shops.push(shop);
    await saveShops(shops);
    return shop;
}

export async function deleteShop(shopId) {
    const shops = getShops().filter(s => s.id !== shopId);
    await saveShops(shops);
}

export function makeEmptyShop() {
    return {
        id: foundry.utils.randomID(),
        name: 'New Shop',
        img: 'icons/svg/chest.svg',
        description: '',
        enabled: true,
        rollTableUuids: [],
        rollCount: 5,
        allowDuplicates: true,
        inventory: []
    };
}

export function goldToHandfuls(gold) {
    return gold?.handfuls ?? 0;
}

export function handfulsToGold(totalHandfuls) {
    return { handfuls: Math.max(0, Math.floor(totalHandfuls)) };
}

export function formatGold(gold) {
    return `${gold.handfuls ?? 0} Luna`;
}

export function formatPrice(priceInHandfuls) {
    return handfulsToGoldLabel(priceInHandfuls);
}

function handfulsToGoldLabel(value) {
    const gold = handfulsToGold(value);
    return formatGold(gold);
}

export function getActorTotalHandfuls(actor) {
    return goldToHandfuls(actor.system.gold);
}

export async function setActorTotalHandfuls(actor, totalHandfuls) {
    const gold = handfulsToGold(Math.max(0, totalHandfuls));
    await actor.update({ 'system.gold': gold });
}

export async function addItemToActor(actor, sourceEntry, quantity = 1) {
    const existing = actor.items.find(i => i.name === sourceEntry.name && i.type === sourceEntry.type);

    if (existing) {
        const newQty = (existing.system.quantity ?? 1) + quantity;
        await existing.update({ 'system.quantity': newQty });
        return existing;
    }

    const itemData = foundry.utils.deepClone(sourceEntry.itemData);
    itemData.system = itemData.system ?? {};
    itemData.system.quantity = quantity;

    const [created] = await actor.createEmbeddedDocuments('Item', [itemData]);
    return created;
}

/** Remove `quantity` from an actor's item, deleting it if it hits zero. */
export async function removeQuantityFromActorItem(actorItem, quantity = 1) {
    const currentQty = actorItem.system.quantity ?? 1;
    const newQty = currentQty - quantity;
    if (newQty <= 0) {
        await actorItem.delete();
    } else {
        await actorItem.update({ 'system.quantity': newQty });
    }
}

export function buildStackKey(item) {
    const source = item.uuid ?? item._id ?? item.name;
    return `src:${source}`;
}

async function resultToSourceItem(result) {
    let doc = null;
    if (result.documentUuid) {
        doc = await fromUuid(result.documentUuid);
    } else if (result.documentCollection && result.documentId) {
        doc = await fromUuid(`${result.documentCollection}.${result.documentId}`);
    }
    if (!doc || doc.documentName !== 'Item') return null;
    return doc;
}

export async function drawShopItems(shop) {
    if (!shop.rollTableUuids?.length) return [];
    const drawn = [];
    for (let i = 0; i < (shop.rollCount || 1); i++) {
        const tableUuid = shop.rollTableUuids[Math.floor(Math.random() * shop.rollTableUuids.length)];
        const table = await fromUuid(tableUuid);
        if (!table) continue;
        const { results } = await table.draw({ displayChat: false });
        for (const result of results) {
            const item = await resultToSourceItem(result);
            if (item) drawn.push(item);
        }
    }
    return drawn;
}

export async function generateShopInventory(shop) {
    const drawnItems = await drawShopItems(shop);
    const inventory = foundry.utils.deepClone(shop.inventory ?? []);
    const catalog = getCatalog();

    for (const sourceItem of drawnItems) {
        const stackKey = buildStackKey(sourceItem);
        const existing = inventory.find(e => e.stackKey === stackKey);
        if (existing) {
            if (shop.allowDuplicates !== false && !existing.unlimited) existing.quantity += 1;
        } else {
            inventory.push({
                id: foundry.utils.randomID(),
                stackKey,
                name: sourceItem.name,
                img: sourceItem.img,
                type: sourceItem.type,
                quantity: 1,
                unlimited: false,
                price: catalog[stackKey]?.price ?? 1,
                itemData: sourceItem.toObject()
            });
        }
    }

    shop.inventory = inventory;
    return shop;
}

export function addDirectItemToShop(shop, sourceItem, quantity = 1, price = 1) {
    const stackKey = buildStackKey(sourceItem);
    const existing = shop.inventory.find(e => e.stackKey === stackKey);
    if (existing) {
        if (!existing.unlimited) existing.quantity += quantity;
        return shop;
    }
    shop.inventory.push({
        id: foundry.utils.randomID(),
        stackKey,
        name: sourceItem.name,
        img: sourceItem.img,
        type: sourceItem.type,
        quantity,
        unlimited: false,
        price,
        itemData: sourceItem.toObject()
    });
    return shop;
}

export function getCatalog() {
    return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.catalog));
}

export function getCatalogEntries() {
    return Object.values(getCatalog());
}

/** Only ever called on the GM (authoritative) client. */
export async function saveCatalog(catalog) {
    if (!game.user.isGM) throw new Error('Only the GM can write the catalog.');
    await game.settings.set(MODULE_ID, SETTINGS.catalog, catalog);
    return catalog;
}

/** Add (or update) a catalog entry from a source Item document (world or compendium). */
export async function upsertCatalogEntry(sourceItem, price = 1) {
    const catalog = getCatalog();
    const stackKey = buildStackKey(sourceItem);
    catalog[stackKey] = {
        stackKey,
        name: sourceItem.name,
        img: sourceItem.img,
        type: sourceItem.type,
        price: catalog[stackKey]?.price ?? Math.max(0, price),
        itemData: sourceItem.toObject()
    };
    await saveCatalog(catalog);
    return catalog[stackKey];
}

export async function updateCatalogPrice(stackKey, price) {
    const catalog = getCatalog();
    if (!catalog[stackKey]) return null;
    catalog[stackKey].price = Math.max(0, price);
    await saveCatalog(catalog);
    return catalog[stackKey];
}

export async function deleteCatalogEntry(stackKey) {
    const catalog = getCatalog();
    delete catalog[stackKey];
    await saveCatalog(catalog);
}

export function findCatalogEntryForItem(item, catalog = getCatalog()) {
    return Object.values(catalog).find(e => e.name === item.name && e.type === item.type) ?? null;
}