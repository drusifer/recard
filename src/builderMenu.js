// US-149/D171: "Add Zone"/"Add Pile" - the missing UI entry point for
// `state.js`'s own CREATE_ZONE/CREATE_PILE, which already existed, are
// already fully unit-tested, and already replicate like any other
// action (D13). No new domain mechanism here, only the two buttons.
//
// Same button-swaps-for-an-inline-control idiom `layoutSave.js`'s
// `performSaveLayoutAs` (US-148/D170) just established, not
// `<action-menu>`'s enum disclosure (`actionControls.js`) - that
// component's contract is built around an EXISTING pile/zone instance's
// own current value, and there is no instance yet here.
import { PILE_TYPES } from './piles/pileTypes.js';

// `hand` is never player-creatable (exactly one per player, owned by
// `ensureHandPile`) - same exclusion `CREATE_ZONE`/`CREATE_PILE`
// themselves enforce, mirrored here so the picker never offers a choice
// the reducer would just reject.
const ADDABLE_KINDS = Object.keys(PILE_TYPES).filter((kind) => kind !== 'hand');

function kindLabel(kind) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function buildKindSelect() {
  const select = document.createElement('select');
  select.className = 'builder-kind-select';
  for (const kind of ADDABLE_KINDS) {
    const option = document.createElement('option');
    option.value = kind;
    option.textContent = kindLabel(kind);
    select.append(option);
  }
  return select;
}

// Only `type: 'shared'` zones - a per-player zone is another player's
// seat, not a sane target for a host building out the shared table.
function buildZoneSelect(zones) {
  const select = document.createElement('select');
  select.className = 'builder-zone-select';
  const sharedZones = zones.filter((z) => z.type === 'shared');
  for (const zone of sharedZones) {
    const option = document.createElement('option');
    option.value = zone.id;
    option.textContent = zone.name ?? zone.id;
    select.append(option);
  }
  return select;
}

/** Swaps `button` for an inline form (`fields` + Create/Cancel), same
 * "cancel is a valid outcome, revert silently" spirit as every other
 * inline edit in this codebase. */
function openInlineForm(button, fields) {
  const form = document.createElement('span');
  form.className = 'builder-inline-form';
  form.append(...fields);

  const createButton = document.createElement('button');
  createButton.type = 'button';
  createButton.textContent = 'Create';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  form.append(createButton, cancelButton);
  button.replaceWith(form);
  fields[0].focus();

  let isSettled = false;
  const close = () => {
    if (isSettled) return;
    isSettled = true;
    form.replaceWith(button);
  };
  cancelButton.addEventListener('click', close);
  form.addEventListener('keydown', (ke) => { if (ke.key === 'Escape') close(); });

  return { form, createButton, close };
}

/**
 * @param {() => { gameState: object }} read current `main.js` state -
 *   only `gameState.zones` is needed, for Add Pile's target picker.
 * @param {{ performCreateZone: (kind: string) => void,
 *   performCreatePile: (kind: string, zoneId: string) => void }} tableActions
 */
export function wireBuilderMenu(read, tableActions) {
  const addZoneButton = document.querySelector('#add-zone-btn');
  const addPileButton = document.querySelector('#add-pile-btn');

  addZoneButton.addEventListener('click', () => {
    const kindSelect = buildKindSelect();
    const { createButton, close } = openInlineForm(addZoneButton, [kindSelect]);
    createButton.addEventListener('click', () => {
      tableActions.performCreateZone(kindSelect.value);
      close();
    });
  });

  addPileButton.addEventListener('click', () => {
    const kindSelect = buildKindSelect();
    const zoneSelect = buildZoneSelect(read().gameState.zones);
    const { createButton, close } = openInlineForm(addPileButton, [kindSelect, zoneSelect]);
    createButton.addEventListener('click', () => {
      tableActions.performCreatePile(kindSelect.value, zoneSelect.value);
      close();
    });
  });
}
