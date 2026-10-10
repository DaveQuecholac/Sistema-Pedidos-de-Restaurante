import {
  InvalidTableIdError,
  InvalidTableLabelError,
  InvalidTableZoneError,
} from './table.errors';

const MAX_TABLE_ID_LENGTH = 40;

type TableCreateInput = {
  id: string;
  label: string;
  zone: string;
};

type TableRestoreInput = TableCreateInput & {
  active: boolean;
};

export class Table {
  private constructor(
    private readonly idValue: string,
    private readonly labelValue: string,
    private readonly zoneValue: string,
    private readonly activeValue: boolean,
  ) {}

  static create(input: TableCreateInput): Table {
    return Table.build({ ...input, active: true });
  }

  static restore(input: TableRestoreInput): Table {
    return Table.build(input);
  }

  rename(label: string): Table {
    return new Table(this.idValue, requireLabel(label), this.zoneValue, this.activeValue);
  }

  setZone(zone: string): Table {
    return new Table(this.idValue, this.labelValue, requireZone(zone), this.activeValue);
  }

  deactivate(): Table {
    if (!this.activeValue) {
      return this;
    }

    return new Table(this.idValue, this.labelValue, this.zoneValue, false);
  }

  activate(): Table {
    if (this.activeValue) {
      return this;
    }

    return new Table(this.idValue, this.labelValue, this.zoneValue, true);
  }

  get id(): string {
    return this.idValue;
  }

  get label(): string {
    return this.labelValue;
  }

  get zone(): string {
    return this.zoneValue;
  }

  get active(): boolean {
    return this.activeValue;
  }

  private static build(input: TableRestoreInput): Table {
    return new Table(
      requireTableId(input.id),
      requireLabel(input.label),
      requireZone(input.zone),
      input.active,
    );
  }
}

function requireTableId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TABLE_ID_LENGTH) {
    throw new InvalidTableIdError();
  }
  return trimmed;
}

function requireLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    throw new InvalidTableLabelError();
  }
  return trimmed;
}

function requireZone(zone: string): string {
  const trimmed = zone.trim();
  if (trimmed.length === 0) {
    throw new InvalidTableZoneError();
  }
  return trimmed;
}
