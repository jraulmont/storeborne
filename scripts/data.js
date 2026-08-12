export const MODULE_ID = 'storeborne';
export const SOCKET = `module.${MODULE_ID}`;

export const SETTINGS = {
    shops: 'shops',
    coinsPerHandful: 'coinsPerHandful',
    returnSoldItems: 'returnSoldItems',
    sellEnabled: 'sellEnabled'
};

/** Item types this module treats as sellable/stockable inventory in the Daggerheart system. */
export const INVENTORY_ITEM_TYPES = ['weapon', 'armor', 'consumable', 'loot'];

export function registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.shops, {
        scope: 'world',
        config: false,
        type: Array,
        default: []
    });

    game.settings.register(MODULE_ID, SETTINGS.coinsPerHandful, {
        name: 'SHOPMARKET.Settings.CoinsPerHandful.Name',
        hint: 'SHOPMARKET.Settings.CoinsPerHandful.Hint',
        scope: 'world',
        config: true,
        type: Number,
        default: 10
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

/* -------------------------------------------- */
/*  Shop CRUD (world setting persistence)        */
/* -------------------------------------------- */

export function getShops() {
    return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.shops));
}

export function getShop(shopId) {
    return getShops().find(s => s.id === shopId) ?? null;
}

/** Only ever called on the GM (authoritative) client. */
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

/* -------------------------------------------- */
/*  Currency math                                */
/*                                                */
/*  The Daggerheart system stores gold as an      */
/*  abstract four-tier structure on the actor:    */
/*  system.gold = { coins, handfuls, bags, chests }*/
/*  with a fixed 10:1 carry between handfuls/bags  */
/*  and bags/chests. There is no built-in exchange */
/*  rate between "coins" and "handfuls" (coins is  */
/*  an optional homebrew subdivision), so this      */
/*  module uses a configurable world setting        */
/*  (coinsPerHandful, default 10) to convert.        */
/*  Item prices are set by the GM as a single        */
/*  number of Handfuls (decimals allowed), which     */
/*  keeps pricing simple while still round-tripping  */
/*  losslessly through the actor's real currency     */
/*  fields.                                          */
/* -------------------------------------------- */

export function coinsPerHandful() {
    return Math.max(1, Number(game.settings.get(MODULE_ID, SETTINGS.coinsPerHandful)) || 10);
}

/** Convert an actor's gold object into a single normalized "handfuls" value. */
export function goldToHandfuls(gold) {
    const cph = coinsPerHandful();
    const coins = gold?.coins ?? 0;
    const handfuls = gold?.handfuls ?? 0;
    const bags = gold?.bags ?? 0;
    const chests = gold?.chests ?? 0;
    return coins / cph + handfuls + bags * 10 + chests * 100;
}

/** Convert a normalized "handfuls" value back into the four-tier gold structure. */
export function handfulsToGold(totalHandfuls) {
    const cph = coinsPerHandful();
    let totalCoins = Math.max(0, Math.round(totalHandfuls * cph));

    const chests = Math.floor(totalCoins / (100 * cph));
    totalCoins -= chests * 100 * cph;

    const bags = Math.floor(totalCoins / (10 * cph));
    totalCoins -= bags * 10 * cph;

    const handfuls = Math.floor(totalCoins / cph);
    totalCoins -= handfuls * cph;

    const coins = totalCoins;

    return { coins, handfuls, bags, chests };
}

export function formatGold(gold) {
    const parts = [];
    if (gold.chests) parts.push(`${gold.chests} c`);
    if (gold.bags) parts.push(`${gold.bags} b`);
    if (gold.handfuls) parts.push(`${gold.handfuls} Lu`);
    if (gold.coins) parts.push(`${gold.coins} co`);
    return parts.length ? parts.join(' ') : '0 Lu';
}

export function formatPrice(priceInHandfuls) {
    return handfulsToGoldLabel(priceInHandfuls);
}

function handfulsToGoldLabel(value) {
    const gold = handfulsToGold(value);
    return formatGold(gold);
}

/* -------------------------------------------- */
/*  Actor helpers                                */
/* -------------------------------------------- */

export function getActorTotalHandfuls(actor) {
    return goldToHandfuls(actor.system.gold);
}

export async function setActorTotalHandfuls(actor, totalHandfuls) {
    const gold = handfulsToGold(Math.max(0, totalHandfuls));
    await actor.update({ 'system.gold': gold });
}

/**
 * Add a snapshot item to an actor's inventory, stacking onto an existing
 * item (matched by the shop catalog entry's stable key) if present.
 */
export async function addItemToActor(actor, catalogEntry, quantity = 1) {
    const key = catalogEntry.stackKey;
    const existing = actor.items.find(i => i.getFlag(MODULE_ID, 'stackKey') === key);

    if (existing) {
        const newQty = (existing.system.quantity ?? 1) + quantity;
        await existing.update({ 'system.quantity': newQty });
        return existing;
    }

    const itemData = foundry.utils.deepClone(catalogEntry.itemData);
    itemData.system = itemData.system ?? {};
    itemData.system.quantity = quantity;
    foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.stackKey`, key);

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

/** Build a stable stacking key for a source item (compendium/world item or a raw item document). */
export function buildStackKey(item) {
    const source = item.uuid ?? item._id ?? item.name;
    return `src:${source}`;
}

/** Resolve the stacking key of an item already sitting in an actor's inventory. */
export function getItemStackKey(item) {
    return (
        item.getFlag(MODULE_ID, 'stackKey') ??
        (item.getFlag('core', 'sourceId') ? `src:${item.getFlag('core', 'sourceId')}` : `src:${item.name}`)
    );
}

/* -------------------------------------------- */
/*  Roll table driven inventory generation       */
/* -------------------------------------------- */

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

/** Draw `shop.rollCount` results across the shop's configured roll tables and return source Item documents. */
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

/**
 * Regenerate a shop's inventory from its configured roll tables. Existing catalog
 * entries (and their GM-set prices) are preserved and topped up; brand-new items
 * are added with a default price of 1 Handful for the GM to adjust.
 */
export async function generateShopInventory(shop) {
    const drawnItems = await drawShopItems(shop);
    const inventory = foundry.utils.deepClone(shop.inventory ?? []);

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
                price: 1,
                itemData: sourceItem.toObject()
            });
        }
    }

    shop.inventory = inventory;
    return shop;
}

/** Add a single item (dragged in directly by the GM) as a new catalog entry. */
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


