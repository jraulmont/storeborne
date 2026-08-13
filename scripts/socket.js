import { MODULE_ID, SOCKET, SETTINGS, getShops, saveShops, getCatalog } from './data.js';

const pending = new Map();

export function initSocket() {
    game.socket.on(SOCKET, handleMessage);
}

function isAuthoritativeGM() {
    if (!game.user.isGM) return false;
    const active = game.users.activeGM;
    return active ? game.user.id === active.id : true;
}

async function handleMessage(msg) {
    if (msg.type === 'response' && pending.has(msg.requestId)) {
        const { resolve } = pending.get(msg.requestId);
        pending.delete(msg.requestId);
        resolve(msg.result);
        return;
    }

    if (!isAuthoritativeGM()) return;

    if (msg.type === 'requestBuy') {
        let result;
        try {
            result = await performBuy(msg.payload);
        } catch (err) {
            console.error('storeborne | Buy request failed', err);
            result = { ok: false, error: 'internal-error' };
        }
        emitResponse(msg.requestId, msg.senderId, result);
    } else if (msg.type === 'requestSell') {
        let result;
        try {
            result = await performSell(msg.payload);
        } catch (err) {
            console.error('storeborne | Sell request failed', err);
            result = { ok: false, error: 'internal-error' };
        }
        emitResponse(msg.requestId, msg.senderId, result);
    }
}

function emitResponse(requestId, targetUserId, result) {
    const payload = { type: 'response', requestId, targetUserId, result };
    game.socket.emit(SOCKET, payload);

    if (targetUserId === game.user.id) handleMessage(payload);
}

function sendRequest(type, payload) {
    if (isAuthoritativeGM()) {
        const fn = type === 'requestBuy' ? performBuy : performSell;
        return fn(payload);
    }

    if (!game.users.activeGM) {
        ui.notifications.warn(game.i18n.localize('SHOPMARKET.Notif.NoGM'));
        return Promise.resolve({ ok: false, error: 'no-gm' });
    }

    const requestId = foundry.utils.randomID();
    const promise = new Promise(resolve => {
        pending.set(requestId, { resolve });
        setTimeout(() => {
            if (pending.has(requestId)) {
                pending.delete(requestId);
                resolve({ ok: false, error: 'timeout' });
            }
        }, 15000);
    });

    game.socket.emit(SOCKET, { type, requestId, senderId: game.user.id, payload });
    return promise;
}

export function requestBuy(payload) {
    return sendRequest('requestBuy', payload);
}

export function requestSell(payload) {
    return sendRequest('requestSell', payload);
}

async function performBuy({ shopId, entryId, quantity }) {
    const shops = getShops();
    const shop = shops.find(s => s.id === shopId);
    if (!shop || !shop.enabled) return { ok: false, error: 'shop-unavailable' };

    const entry = shop.inventory.find(e => e.id === entryId);
    if (!entry) return { ok: false, error: 'item-unavailable' };

    if (!entry.unlimited) {
        if (entry.quantity < quantity) return { ok: false, error: 'insufficient-stock' };
        entry.quantity -= quantity;
    }

    await saveShops(shops);
    return { ok: true, entry: foundry.utils.deepClone(entry), quantity, price: entry.price };
}

async function performSell({ shopId, itemName, itemType, quantity }) {
    if (!game.settings.get(MODULE_ID, SETTINGS.sellEnabled)) {
        return { ok: false, error: 'selling-disabled' };
    }

    const shops = getShops();
    const shop = shops.find(s => s.id === shopId);
    if (!shop || !shop.enabled) return { ok: false, error: 'shop-unavailable' };

    const catalog = getCatalog();
    const catalogEntry = Object.values(catalog).find(e => e.name === itemName && e.type === itemType);
    if (!catalogEntry || catalogEntry.price === null || catalogEntry.price === undefined) {
        return { ok: false, error: 'no-price' };
    }

    if (game.settings.get(MODULE_ID, SETTINGS.returnSoldItems)) {
        const stockEntry = shop.inventory.find(e => e.stackKey === catalogEntry.stackKey);
        if (stockEntry && !stockEntry.unlimited) stockEntry.quantity += quantity;
    }

    await saveShops(shops);
    return { ok: true, price: catalogEntry.price, quantity };
}