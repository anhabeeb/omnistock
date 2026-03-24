import Dexie, { Table } from 'dexie';

export interface LocalMasterData {
  id: string;
  type: 'item' | 'supplier' | 'godown' | 'outlet' | 'category' | 'unit';
  data: any;
  updatedAt: number;
}

export interface LocalCacheMetadata {
  key: string;
  version: string;
  updatedAt: number;
}

export class OmniStockLocalDb extends Dexie {
  masterData!: Table<LocalMasterData>;
  metadata!: Table<LocalCacheMetadata>;

  constructor() {
    super('OmniStockLocalDb');
    this.version(1).stores({
      masterData: 'id, type, updatedAt',
      metadata: 'key'
    });
  }
}

export const localDb = new OmniStockLocalDb();
