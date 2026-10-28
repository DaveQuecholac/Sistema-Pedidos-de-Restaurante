import { describe, expect, it } from 'vitest';
import { Table } from './table';
import {
  InvalidTableIdError,
  InvalidTableLabelError,
  InvalidTableZoneError,
} from './table.errors';

function mesa(overrides: Partial<Parameters<typeof Table.create>[0]> = {}) {
  return {
    id: '1',
    label: '1',
    zone: 'Salón',
    ...overrides,
  };
}

describe('Table', () => {
  it('creates an active table and trims id, label, and zone (D1)', () => {
    const table = Table.create(
      mesa({ id: '  3 ', label: '  Mesa 3  ', zone: '  Terraza  ' }),
    );

    expect(table.id).toBe('3');
    expect(table.label).toBe('Mesa 3');
    expect(table.zone).toBe('Terraza');
    expect(table.active).toBe(true);
  });

  it('rejects a blank or overlong id (D2)', () => {
    for (const id of ['', '   ', 'a'.repeat(41)]) {
      expect(() => Table.create(mesa({ id }))).toThrow(InvalidTableIdError);
    }
  });

  it('accepts an id of exactly 40 characters (D2)', () => {
    const id = 'a'.repeat(40);
    expect(Table.create(mesa({ id })).id).toBe(id);
  });

  it('rejects a blank label (D3)', () => {
    for (const label of ['', '   ']) {
      expect(() => Table.create(mesa({ label }))).toThrow(InvalidTableLabelError);
    }
  });

  it('rejects a blank zone (D4)', () => {
    for (const zone of ['', '   ']) {
      expect(() => Table.create(mesa({ zone }))).toThrow(InvalidTableZoneError);
    }
  });

  it('restores active and inactive tables faithfully (D5)', () => {
    const active = Table.restore({ ...mesa(), active: true });
    const inactive = Table.restore({ ...mesa({ id: '2', label: '2' }), active: false });

    expect(active.active).toBe(true);
    expect(active.id).toBe('1');
    expect(active.label).toBe('1');
    expect(active.zone).toBe('Salón');

    expect(inactive.active).toBe(false);
    expect(inactive.id).toBe('2');
    expect(inactive.label).toBe('2');
  });

  it('deactivates an active table into another value (D6)', () => {
    const table = Table.create(mesa());
    const inactive = table.deactivate();

    expect(inactive).not.toBe(table);
    expect(inactive.active).toBe(false);
    expect(inactive.id).toBe(table.id);
    expect(inactive.label).toBe(table.label);
    expect(inactive.zone).toBe(table.zone);
    expect(table.active).toBe(true);
  });

  it('leaves an inactive table inactive on deactivate (D7)', () => {
    const table = Table.restore({ ...mesa(), active: false });
    const again = table.deactivate();

    expect(again).toBe(table);
    expect(again.active).toBe(false);
  });

  it('activates an inactive table into another value (D8)', () => {
    const table = Table.restore({ ...mesa(), active: false });
    const active = table.activate();

    expect(active).not.toBe(table);
    expect(active.active).toBe(true);
    expect(active.id).toBe(table.id);
    expect(table.active).toBe(false);
  });

  it('leaves an active table active on activate (D9)', () => {
    const table = Table.create(mesa());
    const again = table.activate();

    expect(again).toBe(table);
    expect(again.active).toBe(true);
  });

  it('renames with trim and keeps id, zone, and active (D10)', () => {
    const table = Table.create(mesa());
    const renamed = table.rename('  Ventana  ');

    expect(renamed).not.toBe(table);
    expect(renamed.label).toBe('Ventana');
    expect(renamed.id).toBe('1');
    expect(renamed.zone).toBe('Salón');
    expect(renamed.active).toBe(true);
  });

  it('rejects a blank rename (D10)', () => {
    const table = Table.create(mesa());
    expect(() => table.rename('   ')).toThrow(InvalidTableLabelError);
  });

  it('changes zone with trim and keeps id, label, and active (D11)', () => {
    const table = Table.create(mesa());
    const moved = table.setZone('  Patio  ');

    expect(moved).not.toBe(table);
    expect(moved.zone).toBe('Patio');
    expect(moved.id).toBe('1');
    expect(moved.label).toBe('1');
    expect(moved.active).toBe(true);
  });

  it('rejects a blank zone change (D11)', () => {
    const table = Table.create(mesa());
    expect(() => table.setZone('')).toThrow(InvalidTableZoneError);
  });
});
