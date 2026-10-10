'use client';

import { useEffect, useState } from 'react';
import shellStyles from '../components/app-shell/app-shell.module.css';
import { useShell } from '../components/app-shell/shell-context';
import {
  basisPointsToPercentLabel,
  catalogView,
  centavosToLabel,
  percentToBasisPoints,
  pesosToCentavos,
} from './menu-amount';
import {
  createMenuItem,
  deactivateMenuItem,
  listMenuItems,
  MenuApiError,
  updateMenuItem,
  type CreateMenuItemBody,
  type MenuItemJson,
  type MenuModifierWrite,
} from './menu-api';
import styles from './menu-admin.module.css';

type FormIngredient = {
  key: string;
  name: string;
};

type FormModifier = {
  key: string;
  name: string;
  kind: string;
  priceText: string;
};

type FormState = {
  name: string;
  priceText: string;
  taxText: string;
  active: boolean;
  ingredients: FormIngredient[];
  modifiers: FormModifier[];
};

type Failure = {
  code: string | null;
  message: string;
};

type CatalogState =
  | { kind: 'loading' }
  | { kind: 'error'; failure: Failure }
  | { kind: 'ready'; items: MenuItemJson[] };

type Draft =
  | { ok: true; body: CreateMenuItemBody }
  | { ok: false; message: string };

export function MenuAdminScreen() {
  const { selection, selectMenuItem } = useShell();
  const [catalog, setCatalog] = useState<CatalogState>({ kind: 'loading' });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void refreshCatalog(setCatalog);
  }, []);

  const view = catalogView(
    catalog.kind === 'ready' ? { kind: 'ready', items: catalog.items } : { kind: catalog.kind },
  );

  async function save(activeOverride?: boolean) {
    const draft = validate(form);
    if (!draft.ok) {
      setNotice(draft.message);
      return;
    }

    setNotice(null);
    setSending(true);
    try {
      if (editingId === null) {
        await createMenuItem(draft.body);
        const items = await refreshCatalog(setCatalog);
        if (items !== null) {
          setEditingId(null);
          setForm(emptyForm());
        }
        return;
      }

      await updateMenuItem(editingId, { ...draft.body, active: activeOverride ?? form.active });
      const items = await refreshCatalog(setCatalog);
      if (items !== null) {
        const saved = items.find((item) => item.id === editingId);
        if (saved) {
          setForm(formFromItem(saved));
        }
      }
    } catch (error) {
      setNotice(failureText(error));
    } finally {
      setSending(false);
    }
  }

  async function onActivate(item: MenuItemJson) {
    setNotice(null);
    setSending(true);
    try {
      await updateMenuItem(item.id, { ...activationBody(item), active: true });
      const items = await refreshCatalog(setCatalog);
      if (items !== null && editingId === item.id) {
        const saved = items.find((row) => row.id === item.id);
        if (saved) {
          setForm(formFromItem(saved));
        }
      }
    } catch (error) {
      setNotice(failureText(error));
    } finally {
      setSending(false);
    }
  }

  async function onDeactivate(id: string) {
    setNotice(null);
    setSending(true);
    try {
      await deactivateMenuItem(id);
      const items = await refreshCatalog(setCatalog);
      if (items !== null && editingId === id) {
        const saved = items.find((item) => item.id === id);
        if (saved) {
          setForm(formFromItem(saved));
        }
      }
    } catch (error) {
      setNotice(failureText(error));
    } finally {
      setSending(false);
    }
  }

  function startEdit(item: MenuItemJson) {
    setEditingId(item.id);
    setForm(formFromItem(item));
    setNotice(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setNotice(null);
  }

  function renameIngredient(key: string, name: string) {
    setForm((current) => {
      const previous = current.ingredients.find((ingredient) => ingredient.key === key)?.name ?? '';
      return {
        ...current,
        ingredients: current.ingredients.map((ingredient) =>
          ingredient.key === key ? { ...ingredient, name } : ingredient,
        ),
        modifiers: current.modifiers.map((modifier) =>
          modifier.kind === 'exclusion' && previous !== '' && modifier.name === previous
            ? { ...modifier, name }
            : modifier,
        ),
      };
    });
  }

  function removeIngredient(key: string) {
    setForm((current) => {
      const removed = current.ingredients.find((ingredient) => ingredient.key === key);
      return {
        ...current,
        ingredients: current.ingredients.filter((ingredient) => ingredient.key !== key),
        modifiers: current.modifiers.map((modifier) =>
          modifier.kind === 'exclusion' && removed !== undefined && modifier.name === removed.name
            ? { ...modifier, name: '' }
            : modifier,
        ),
      };
    });
  }

  function updateModifier(key: string, patch: Partial<FormModifier>) {
    setForm((current) => ({
      ...current,
      modifiers: current.modifiers.map((modifier) => (modifier.key === key ? { ...modifier, ...patch } : modifier)),
    }));
  }

  function removeModifier(key: string) {
    setForm((current) => ({
      ...current,
      modifiers: current.modifiers.filter((modifier) => modifier.key !== key),
    }));
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Menú</h1>
      </header>

      {view === 'loading' ? <p>Cargando el menú…</p> : null}

      {view === 'error' && catalog.kind === 'error' ? (
        <div className={styles.error} role="alert">
          {catalog.failure.code ? <p>{catalog.failure.code}</p> : null}
          <p>{catalog.failure.message}</p>
          <button type="button" disabled={sending} onClick={() => void refreshCatalog(setCatalog)}>
            <Icon name="retry" />
            Reintentar
          </button>
        </div>
      ) : null}

      {view === 'empty' || view === 'list' ? (
        <div className={styles.workspace}>
          <section className={styles.catalogPanel} aria-label="Platos">
            {view === 'empty' ? (
              <p className={styles.empty}>Todavía no hay platos. Crea el primero.</p>
            ) : (
              <ul className={styles.catalog}>
                {catalog.kind === 'ready'
                  ? catalog.items.map((item) => (
                      <li
                        key={item.id}
                        className={[
                          item.active ? styles.row : styles.rowInactive,
                          shellStyles.selectable,
                          selection.kind === 'menuItem' && selection.menuItemId === item.id
                            ? shellStyles.selectableSelected
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        role="button"
                        tabIndex={0}
                        aria-pressed={
                          selection.kind === 'menuItem' && selection.menuItemId === item.id
                        }
                        onClick={() => selectMenuItem(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            selectMenuItem(item.id);
                          }
                        }}
                      >
                        <h2>{item.name}</h2>
                        {item.ingredients.length > 0 ? (
                          <p>Lleva {item.ingredients.map((ingredient) => ingredient.name).join(', ')}</p>
                        ) : null}
                        <p className={styles.meta}>
                          <span>{centavosToLabel(item.price.amount)}</span>
                          <span>Impuesto {basisPointsToPercentLabel(item.applicableTax.basisPoints)}</span>
                          <span>{item.active ? 'Activo' : 'Inactivo'}</span>
                        </p>
                        {item.modifiers.length > 0 ? (
                          <ul className={styles.modifiers}>
                            {item.modifiers.map((modifier) => (
                              <li key={modifier.id}>
                                {modifier.name}
                                {' · '}
                                {kindLabel(modifier.kind)}
                                {' · '}
                                {modifier.kind === 'exclusion' || modifier.price === null
                                  ? 'sin cargo'
                                  : centavosToLabel(modifier.price.amount)}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <div className={styles.actions}>
                          <button type="button" disabled={sending} onClick={(event) => { event.stopPropagation(); startEdit(item); }}>
                            <Icon name="pencil" />
                            Editar plato
                          </button>
                          {item.active ? (
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={sending}
                              onClick={(event) => { event.stopPropagation(); void onDeactivate(item.id); }}
                            >
                              <Icon name="ban" />
                              Desactivar plato
                            </button>
                          ) : (
                            <button type="button" disabled={sending} onClick={(event) => { event.stopPropagation(); void onActivate(item); }}>
                              <Icon name="check" />
                              Activar plato
                            </button>
                          )}
                        </div>
                      </li>
                    ))
                  : null}
              </ul>
            )}
          </section>

          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <h2>{editingId === null ? 'Nuevo plato' : 'Editar plato'}</h2>
            <label>
              Nombre
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              Precio (pesos)
              <input
                inputMode="decimal"
                value={form.priceText}
                onChange={(event) => setForm((current) => ({ ...current, priceText: event.target.value }))}
              />
            </label>
            <label>
              Impuesto (%)
              <input
                inputMode="decimal"
                value={form.taxText}
                onChange={(event) => setForm((current) => ({ ...current, taxText: event.target.value }))}
              />
            </label>

            <details className={styles.panel}>
              <summary>Ingredientes ({form.ingredients.length})</summary>
              <div className={styles.panelBody}>
              <p className={styles.hint}>Lo que el plato trae. Un omitir solo puede quitar uno de estos.</p>
              {form.ingredients.map((ingredient) => (
                <div key={ingredient.key} className={styles.modifier}>
                  <label>
                    Ingrediente
                    <input
                      value={ingredient.name}
                      onChange={(event) => renameIngredient(ingredient.key, event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={sending}
                    onClick={() => removeIngredient(ingredient.key)}
                  >
                    <Icon name="x" />
                    Quitar ingrediente
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={sending}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    ingredients: [...current.ingredients, { key: crypto.randomUUID(), name: '' }],
                  }))
                }
              >
                <Icon name="plus" />
                Agregar ingrediente
              </button>
              </div>
            </details>

            <details className={styles.panel}>
              <summary>Modificadores ({form.modifiers.length})</summary>
              <div className={styles.panelBody}>
              <p className={styles.hint}>Extra se cobra y se escribe. Omitir elige un ingrediente y no se cobra.</p>
              {form.modifiers.map((modifier) => (
                <div key={modifier.key} className={styles.modifier}>
                  {modifier.kind === 'exclusion' ? (
                    <label>
                      Ingrediente que se omite
                      <select
                        value={modifier.name}
                        onChange={(event) => updateModifier(modifier.key, { name: event.target.value })}
                      >
                        <option value="">Elige un ingrediente</option>
                        {omitChoices(form, modifier.key).map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label>
                      Nombre del extra
                      <input
                        value={modifier.name}
                        onChange={(event) => updateModifier(modifier.key, { name: event.target.value })}
                      />
                    </label>
                  )}
                  <label>
                    Tipo
                    <select
                      value={modifier.kind}
                      onChange={(event) =>
                        updateModifier(modifier.key, {
                          kind: event.target.value,
                          name: event.target.value === 'exclusion' ? '' : modifier.name,
                          priceText: event.target.value === 'exclusion' ? '' : modifier.priceText,
                        })
                      }
                    >
                      <option value="extra">Extra</option>
                      <option value="exclusion">Omitir</option>
                      {modifier.kind !== 'extra' && modifier.kind !== 'exclusion' ? (
                        <option value={modifier.kind}>{modifier.kind}</option>
                      ) : null}
                    </select>
                  </label>
                  {modifier.kind !== 'exclusion' || modifier.priceText.trim() !== '' ? (
                    <label>
                      Precio del extra
                      <input
                        inputMode="decimal"
                        value={modifier.priceText}
                        onChange={(event) => updateModifier(modifier.key, { priceText: event.target.value })}
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={sending}
                    onClick={() => removeModifier(modifier.key)}
                  >
                    <Icon name="x" />
                    Quitar modificador
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={sending}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    modifiers: [
                      ...current.modifiers,
                      { key: crypto.randomUUID(), name: '', kind: 'extra', priceText: '' },
                    ],
                  }))
                }
              >
                <Icon name="plus" />
                Agregar modificador
              </button>
              </div>
            </details>

            {notice ? (
              <p className={styles.notice} role="alert">
                {notice}
              </p>
            ) : null}
            <div className={styles.actions}>
              <button className={styles.primary} type="submit" disabled={sending}>
                <Icon name="check" />
                {editingId === null ? 'Guardar plato' : 'Guardar cambios'}
              </button>
              {editingId !== null ? (
                <button type="button" disabled={sending} onClick={cancelEdit}>
                  <Icon name="x" />
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

async function refreshCatalog(
  setCatalog: (catalog: CatalogState) => void,
): Promise<MenuItemJson[] | null> {
  setCatalog({ kind: 'loading' });
  try {
    const items = await listMenuItems();
    setCatalog({ kind: 'ready', items });
    return items;
  } catch (error) {
    setCatalog({ kind: 'error', failure: failureOf(error) });
    return null;
  }
}

function emptyForm(): FormState {
  return { name: '', priceText: '', taxText: '', active: true, ingredients: [], modifiers: [] };
}

function formFromItem(item: MenuItemJson): FormState {
  return {
    name: item.name,
    priceText: centavosToLabel(item.price.amount).slice(1),
    taxText: basisPointsToPercentLabel(item.applicableTax.basisPoints).replace(/ %$/, ''),
    active: item.active,
    ingredients: item.ingredients.map((ingredient) => ({
      key: ingredient.id,
      name: ingredient.name,
    })),
    modifiers: item.modifiers.map((modifier) => ({
      key: modifier.id,
      name: modifier.name,
      kind: modifier.kind,
      priceText: modifier.price === null ? '' : centavosToLabel(modifier.price.amount).slice(1),
    })),
  };
}

function validate(form: FormState): Draft {
  const name = form.name.trim();
  if (name === '') {
    return { ok: false, message: 'El nombre no puede quedar vacío.' };
  }

  let amount: number;
  try {
    amount = pesosToCentavos(form.priceText);
  } catch {
    return { ok: false, message: 'El precio no es válido.' };
  }

  let basisPoints: number;
  try {
    basisPoints = percentToBasisPoints(form.taxText);
  } catch {
    return { ok: false, message: 'El impuesto no es válido.' };
  }

  const ingredients: { name: string }[] = [];
  const ingredientNames = new Set<string>();
  for (const ingredient of form.ingredients) {
    const ingredientName = ingredient.name.trim();
    if (ingredientName === '') {
      return { ok: false, message: 'El nombre del ingrediente no puede quedar vacío.' };
    }
    if (ingredientNames.has(ingredientName)) {
      return { ok: false, message: 'Ese ingrediente ya está en el plato.' };
    }
    ingredientNames.add(ingredientName);
    ingredients.push({ name: ingredientName });
  }

  const modifiers: MenuModifierWrite[] = [];
  for (const modifier of form.modifiers) {
    const modifierName = modifier.name.trim();
    if (modifier.kind === 'exclusion' && modifierName === '') {
      return { ok: false, message: 'Elige el ingrediente que se omite.' };
    }
    if (modifierName === '') {
      return { ok: false, message: 'El nombre del extra no puede quedar vacío.' };
    }
    if (modifier.kind !== 'extra' && modifier.kind !== 'exclusion') {
      return { ok: false, message: 'El tipo del modificador no es válido.' };
    }
    if (modifier.kind === 'exclusion') {
      if (!ingredientNames.has(modifierName)) {
        return { ok: false, message: 'Un omitir solo puede quitar un ingrediente de este plato.' };
      }
      if (modifier.priceText.trim() !== '') {
        return { ok: false, message: 'Un «omitir» no lleva precio. Borra ese precio o cámbialo a extra.' };
      }
      modifiers.push({ name: modifierName, kind: 'exclusion' });
      continue;
    }

    let priceAmount: number;
    try {
      priceAmount = pesosToCentavos(modifier.priceText);
    } catch {
      return { ok: false, message: 'El precio del extra no es válido.' };
    }
    modifiers.push({
      name: modifierName,
      kind: 'extra',
      price: { amount: priceAmount, currency: 'MXN' },
    });
  }

  return {
    ok: true,
    body: {
      name,
      price: { amount, currency: 'MXN' },
      applicableTax: { basisPoints },
      ingredients,
      modifiers,
    },
  };
}

function failureOf(error: unknown): Failure {
  if (error instanceof MenuApiError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: null, message: error.message };
  }
  return { code: null, message: 'No se pudo cargar el menú.' };
}

function failureText(error: unknown): string {
  const failure = failureOf(error);
  return failure.code ? `${failure.code}: ${failure.message}` : failure.message;
}

function activationBody(item: MenuItemJson): CreateMenuItemBody {
  return {
    name: item.name,
    price: { amount: item.price.amount, currency: item.price.currency },
    applicableTax: { basisPoints: item.applicableTax.basisPoints },
    ingredients: item.ingredients.map((ingredient) => ({ name: ingredient.name })),
    modifiers: item.modifiers.map((modifier): MenuModifierWrite => {
      if (modifier.kind === 'exclusion' || modifier.price === null) {
        return { name: modifier.name, kind: 'exclusion' };
      }
      return {
        name: modifier.name,
        kind: 'extra',
        price: { amount: modifier.price.amount, currency: modifier.price.currency },
      };
    }),
  };
}

function omitChoices(form: FormState, currentKey: string): string[] {
  const taken = new Set(
    form.modifiers
      .filter((modifier) => modifier.kind === 'exclusion' && modifier.key !== currentKey)
      .map((modifier) => modifier.name.trim())
      .filter((name) => name !== ''),
  );
  const names: string[] = [];
  for (const ingredient of form.ingredients) {
    const name = ingredient.name.trim();
    if (name === '' || taken.has(name) || names.includes(name)) {
      continue;
    }
    names.push(name);
  }
  return names;
}

function kindLabel(kind: string): string {
  if (kind === 'exclusion') return 'omitir';
  if (kind === 'extra') return 'extra';
  return kind;
}

function Icon({ name }: { name: 'plus' | 'x' | 'check' | 'pencil' | 'ban' | 'retry' }) {
  const common = {
    viewBox: '0 0 24 24',
    width: 18,
    height: 18,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'plus') {
    return (
      <svg {...common}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  if (name === 'x') {
    return (
      <svg {...common}>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  if (name === 'check') {
    return (
      <svg {...common}>
        <path d="M5 12l5 5L20 7" />
      </svg>
    );
  }
  if (name === 'pencil') {
    return (
      <svg {...common}>
        <path d="M4 20h4l10-10-4-4L4 16v4z" />
      </svg>
    );
  }
  if (name === 'ban') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M7 17L17 7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M20 12a8 8 0 1 1-2.2-5.5" />
      <path d="M20 5v5h-5" />
    </svg>
  );
}
