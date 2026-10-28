import { InvalidTableIdError } from '../table/table.errors';
import {
  InvalidExternalOrderIdError,
  InvalidOrderOriginError,
} from './order.errors';

const MAX_TABLE_ID_LENGTH = 40;
const MAX_EXTERNAL_ORDER_ID_LENGTH = 64;

export type OrderOriginInput = {
  tableId?: string;
  externalOrderId?: string;
};

/** Mesa or external channel id — exactly one. Immutable. */
export class OrderOrigin {
  private constructor(
    private readonly tableIdValue: string | null,
    private readonly externalOrderIdValue: string | null,
  ) {}

  static table(tableId: string): OrderOrigin {
    return new OrderOrigin(requireTableId(tableId), null);
  }

  static external(externalOrderId: string): OrderOrigin {
    return new OrderOrigin(null, requireExternalOrderId(externalOrderId));
  }

  /**
   * Builds from the shape HTTP will send. Rejects both fields or neither
   * before validating the chosen id. OpenOrder will call this later.
   */
  static fromInput(input: OrderOriginInput): OrderOrigin {
    const hasTable = typeof input.tableId === 'string';
    const hasExternal = typeof input.externalOrderId === 'string';

    if (hasTable === hasExternal) {
      throw new InvalidOrderOriginError();
    }

    if (hasTable) {
      return OrderOrigin.table(input.tableId as string);
    }

    return OrderOrigin.external(input.externalOrderId as string);
  }

  get tableId(): string | null {
    return this.tableIdValue;
  }

  get externalOrderId(): string | null {
    return this.externalOrderIdValue;
  }
}

function requireTableId(tableId: string): string {
  const trimmed = tableId.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TABLE_ID_LENGTH) {
    throw new InvalidTableIdError();
  }
  return trimmed;
}

function requireExternalOrderId(externalOrderId: string): string {
  const trimmed = externalOrderId.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EXTERNAL_ORDER_ID_LENGTH) {
    throw new InvalidExternalOrderIdError();
  }
  return trimmed;
}
