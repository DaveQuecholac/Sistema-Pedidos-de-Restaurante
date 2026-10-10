'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import shellStyles from '../components/app-shell/app-shell.module.css';
import { useShell } from '../components/app-shell/shell-context';
import { OrderApiError } from '../ordenes/order-api';
import { errorText } from '../ordenes/order-view';
import {
  activateTable,
  createTable,
  deactivateTable,
  listTables,
  TablesApiError,
  updateTable,
  type TableJson,
} from './mesas-api';
import styles from './mesas-admin.module.css';

type CatalogState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; tables: TableJson[] };

type FormState = {
  id: string;
  label: string;
  zone: string;
};

const EMPTY_FORM: FormState = { id: '', label: '', zone: 'Salón' };

export function MesasAdminScreen() {
  const { selection, selectTable, bumpRefresh } = useShell();
  const [catalog, setCatalog] = useState<CatalogState>({ kind: 'loading' });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void loadCatalog(setCatalog);
  }, []);

  async function reload() {
    const tables = await loadCatalog(setCatalog);
    bumpRefresh();
    return tables;
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setNotice(null);
  }

  function startEdit(table: TableJson) {
    setEditingId(table.id);
    setForm({ id: table.id, label: table.label, zone: table.zone });
    setNotice(null);
    selectTable(table.id);
  }

  async function onSave() {
    const id = form.id.trim();
    const label = form.label.trim();
    const zone = form.zone.trim() || 'Salón';

    if (editingId === null && id === '') {
      setNotice('Escribe el número o id de la mesa.');
      return;
    }
    if (label === '') {
      setNotice('Escribe la etiqueta de la mesa.');
      return;
    }

    setNotice(null);
    setSending(true);
    try {
      if (editingId === null) {
        const created = await createTable({ id, label, zone });
        await reload();
        setEditingId(null);
        setForm(EMPTY_FORM);
        selectTable(created.id);
        return;
      }

      await updateTable(editingId, { label, zone });
      await reload();
      selectTable(editingId);
    } catch (error) {
      setNotice(adminErrorText(error));
    } finally {
      setSending(false);
    }
  }

  async function onDeactivate(tableId: string) {
    setNotice(null);
    setSending(true);
    try {
      await deactivateTable(tableId);
      await reload();
      selectTable(tableId);
    } catch (error) {
      setNotice(adminErrorText(error));
    } finally {
      setSending(false);
    }
  }

  async function onActivate(tableId: string) {
    setNotice(null);
    setSending(true);
    try {
      await activateTable(tableId);
      await reload();
      selectTable(tableId);
    } catch (error) {
      setNotice(adminErrorText(error));
    } finally {
      setSending(false);
    }
  }

  const selectedId = selection.kind === 'table' ? selection.tableId : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Mesas · admin</h1>
          <p className={styles.lead}>Agrega, edita o quita mesas del piso (quitar = desactivar).</p>
        </div>
        <Link className={styles.navLink} href="/">
          Volver al piso
        </Link>
      </header>

      {catalog.kind === 'loading' ? <p>Cargando mesas…</p> : null}

      {catalog.kind === 'error' ? (
        <div className={styles.error} role="alert">
          <p>{catalog.message}</p>
          <button type="button" disabled={sending} onClick={() => void loadCatalog(setCatalog)}>
            Reintentar
          </button>
        </div>
      ) : null}

      {notice ? (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      ) : null}

      {catalog.kind === 'ready' ? (
        <div className={styles.workspace}>
          <section className={styles.catalogPanel} aria-label="Catálogo de mesas">
            {catalog.tables.length === 0 ? (
              <p className={styles.empty}>Todavía no hay mesas. Crea la primera.</p>
            ) : (
              <ul className={styles.catalog}>
                {catalog.tables.map((table) => {
                  const selected = selectedId === table.id;
                  return (
                    <li
                      key={table.id}
                      className={[
                        table.active ? styles.row : styles.rowInactive,
                        shellStyles.selectable,
                        selected ? shellStyles.selectableSelected : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      onClick={() => selectTable(table.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectTable(table.id);
                        }
                      }}
                    >
                      <h2>
                        {table.label} <span className={styles.meta}>({table.id})</span>
                      </h2>
                      <p className={styles.meta}>
                        <span>{table.zone}</span>
                        <span>{table.active ? 'Activa' : 'Inactiva'}</span>
                      </p>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          disabled={sending}
                          onClick={(event) => {
                            event.stopPropagation();
                            startEdit(table);
                          }}
                        >
                          Editar
                        </button>
                        {table.active ? (
                          <button
                            type="button"
                            className={styles.danger}
                            disabled={sending}
                            onClick={(event) => {
                              event.stopPropagation();
                              void onDeactivate(table.id);
                            }}
                          >
                            Desactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={sending}
                            onClick={(event) => {
                              event.stopPropagation();
                              void onActivate(table.id);
                            }}
                          >
                            Activar
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void onSave();
            }}
          >
            <h2>{editingId === null ? 'Nueva mesa' : `Editar mesa ${editingId}`}</h2>
            {editingId === null ? (
              <label>
                Id / número
                <input
                  value={form.id}
                  autoComplete="off"
                  disabled={sending}
                  onChange={(event) => setForm((current) => ({ ...current, id: event.target.value }))}
                />
              </label>
            ) : null}
            <label>
              Etiqueta
              <input
                value={form.label}
                autoComplete="off"
                disabled={sending}
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              />
            </label>
            <label>
              Zona
              <input
                value={form.zone}
                autoComplete="off"
                disabled={sending}
                onChange={(event) => setForm((current) => ({ ...current, zone: event.target.value }))}
              />
            </label>
            <div className={styles.formActions}>
              <button type="submit" disabled={sending}>
                {editingId === null ? 'Crear mesa' : 'Guardar cambios'}
              </button>
              {editingId !== null ? (
                <button type="button" disabled={sending} onClick={startCreate}>
                  Cancelar edición
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

async function loadCatalog(
  setCatalog: (state: CatalogState) => void,
): Promise<TableJson[] | null> {
  setCatalog({ kind: 'loading' });
  try {
    const tables = await listTables();
    const sorted = [...tables].sort((left, right) =>
      left.id.localeCompare(right.id, 'es', { numeric: true }),
    );
    setCatalog({ kind: 'ready', tables: sorted });
    return sorted;
  } catch (error) {
    setCatalog({ kind: 'error', message: adminErrorText(error) });
    return null;
  }
}

function adminErrorText(error: unknown): string {
  if (error instanceof TablesApiError) {
    return errorText(new OrderApiError(error.status, error.message, error.code));
  }
  return errorText(error);
}
