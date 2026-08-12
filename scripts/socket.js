import { MODULE_ID, SOCKET, SETTINGS, getShops, saveShops } from './data.js';

const pending = new Map();

export function initSocket() {
    game.socket.on(SOCKET, handleMessage);
}

function isAuthoritativeGM() {
    // Only the single "active GM" (Foundry v11+) answers requests, so two
    // GM clients online at once don't double-process a transaction.
    return game.user.isGM && game.user.id === game.users.activeGM?.id;
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
        const result = await performBuy(msg.payload);
        emitResponse(msg.requestId, msg.senderId, result);
    } else if (msg.type === 'requestSell') {
        const result = await performSell(msg.payload);
        emitResponse(msg.requestId, msg.senderId, result);
    }
}

function emitResponse(requestId, targetUserId, result) {
    const payload = { type: 'response', requestId, targetUserId, result };
    game.socket.emit(SOCKET, payload);
    // The GM is also a client; if the GM itself is the buyer/seller, loop back locally.
    if (targetUserId === game.user.id) handleMessage(payload);
}

/** Send a request to the GM and await the structured result. Resolves locally if the caller is the GM. */
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

/* -------------------------------------------- */
/*  GM-side authoritative transaction handlers   */
/* -------------------------------------------- */

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

async function performSell({ shopId, stackKey, quantity }) {
    if (!game.settings.get(MODULE_ID, SETTINGS.sellEnabled)) {
        return { ok: false, error: 'selling-disabled' };
    }

    const shops = getShops();
    const shop = shops.find(s => s.id === shopId);
    if (!shop || !shop.enabled) return { ok: false, error: 'shop-unavailable' };

    const entry = shop.inventory.find(e => e.stackKey === stackKey);
    if (!entry || entry.price === null || entry.price === undefined) {
        return { ok: false, error: 'no-price' };
    }

    if (game.settings.get(MODULE_ID, SETTINGS.returnSoldItems) && !entry.unlimited) {
        entry.quantity += quantity;
    }

    await saveShops(shops);
    return { ok: true, price: entry.price, quantity };
}
