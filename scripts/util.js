export function resolvePlayerActor() {
    if (game.user.character) return game.user.character;
    const owned = game.actors.filter(a => a.isOwner && a.type === 'character');
    if (owned.length === 1) return owned[0];
    return null;
}

export async function promptForActor() {
    const owned = game.actors.filter(a => a.isOwner && (a.type === 'character' || a.type === 'party'));
    if (!owned.length) {
        ui.notifications.warn(game.i18n.localize('SHOPMARKET.Notif.NoActor'));
        return null;
    }
    if (owned.length === 1) return owned[0];

    const options = owned.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    const actorId = await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.localize('SHOPMARKET.Dialog.PickActorTitle') },
        content: `<p>${game.i18n.localize('SHOPMARKET.Dialog.PickActorHint')}</p>
            <select name="actorId" style="width:100%">${options}</select>`,
        ok: {
            label: game.i18n.localize('SHOPMARKET.Dialog.PickActorConfirm'),
            callback: (event, button) => button.form.elements.actorId.value
        }
    });
    return actorId ? game.actors.get(actorId) : null;
}
