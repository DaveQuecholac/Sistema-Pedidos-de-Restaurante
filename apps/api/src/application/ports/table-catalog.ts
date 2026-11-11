/** Read-only floor plan. A missing id is null. A silent process is not null. */
export type TableSnapshot = {
  id: string;
  label: string;
  zone: string;
  active: boolean;
};

export interface TableCatalog {
  findById(id: string): Promise<TableSnapshot | null>;
}
