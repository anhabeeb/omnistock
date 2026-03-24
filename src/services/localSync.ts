import axios from 'axios';
import { localDb } from '../db/localDb';

export type MasterDataType = 'item' | 'supplier' | 'godown' | 'outlet' | 'category' | 'unit';

export class LocalSyncService {
  static getPermittedMasterDataTypes(): MasterDataType[] {
    const allTypes: MasterDataType[] = ['item', 'supplier', 'godown', 'outlet', 'category', 'unit'];
    const permissionMap: Record<MasterDataType, string> = {
      item: 'master.items.view',
      supplier: 'master.suppliers.view',
      godown: 'master.godowns.view',
      outlet: 'master.outlets.view',
      category: 'master.categories.view',
      unit: 'master.units.view'
    };

    try {
      const rawUser = localStorage.getItem('user');
      const user = rawUser ? JSON.parse(rawUser) : {};
      const permissions = Array.isArray(user.permissions) ? user.permissions : [];

      if (user.role === 'super_admin') {
        return allTypes;
      }

      return allTypes.filter((type) => permissions.includes(permissionMap[type]));
    } catch {
      return [];
    }
  }

  static async syncMasterData(type: MasterDataType) {
    const endpointMap = {
      item: '/api/items',
      supplier: '/api/suppliers',
      godown: '/api/godowns',
      outlet: '/api/outlets',
      category: '/api/categories',
      unit: '/api/units'
    };

    const endpoint = endpointMap[type];
    if (!endpoint) return;

    try {
      const response = await axios.get(endpoint);
      const data = response.data;

      if (Array.isArray(data)) {
        await localDb.transaction('rw', localDb.masterData, async () => {
          // Clear existing data of this type
          await localDb.masterData.where('type').equals(type).delete();
          
          // Bulk add new data
          const now = Date.now();
          const records = data.map(item => ({
            id: `${type}_${item.id}`,
            type,
            data: item,
            updatedAt: now
          }));
          
          await localDb.masterData.bulkAdd(records);
        });
      }
    } catch (error) {
      console.error(`Failed to sync ${type}:`, error);
    }
  }

  static async getLocalData(type: MasterDataType) {
    const records = await localDb.masterData.where('type').equals(type).toArray();
    return records.map(r => r.data);
  }

  static async syncAll() {
    const types = this.getPermittedMasterDataTypes();
    await Promise.all(types.map(t => this.syncMasterData(t)));
  }
}
