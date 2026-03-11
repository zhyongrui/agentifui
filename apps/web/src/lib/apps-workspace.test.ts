import { describe, expect, it } from 'vitest';

import {
  readStoredGroupId,
  readStoredIds,
  recordRecentApp,
  resolveActiveGroupId,
  toggleFavoriteApp,
  writeStoredGroupId,
  writeStoredIds,
} from './apps-workspace.js';

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe('apps workspace storage helpers', () => {
  it('reads id lists safely from storage', () => {
    const storage = createStorage();

    storage.setItem('favorites', JSON.stringify(['app_a', 'app_a', 'app_b', 42]));
    storage.setItem('broken', '{not-json');

    expect(readStoredIds(storage, 'favorites')).toEqual(['app_a', 'app_b']);
    expect(readStoredIds(storage, 'broken')).toEqual([]);
    expect(readStoredIds(storage, 'missing')).toEqual([]);
  });

  it('writes favorite ids and active groups back to storage', () => {
    const storage = createStorage();

    writeStoredIds(storage, 'favorites', ['app_a', 'app_a', 'app_b']);
    writeStoredGroupId(storage, 'active-group', 'grp_product');

    expect(storage.getItem('favorites')).toBe('["app_a","app_b"]');
    expect(readStoredGroupId(storage, 'active-group')).toBe('grp_product');
  });

  it('toggles favorites and keeps recent apps in recency order', () => {
    expect(toggleFavoriteApp(['app_a'], 'app_b')).toEqual(['app_a', 'app_b']);
    expect(toggleFavoriteApp(['app_a', 'app_b'], 'app_a')).toEqual(['app_b']);
    expect(recordRecentApp(['app_a', 'app_b', 'app_c'], 'app_b', 3)).toEqual([
      'app_b',
      'app_a',
      'app_c',
    ]);
    expect(recordRecentApp(['app_a', 'app_b', 'app_c'], 'app_d', 3)).toEqual([
      'app_d',
      'app_a',
      'app_b',
    ]);
  });

  it('falls back when a stored active group is not part of the current membership', () => {
    expect(resolveActiveGroupId('grp_research', ['grp_product', 'grp_research'], 'grp_product')).toBe(
      'grp_research'
    );
    expect(resolveActiveGroupId('grp_security', ['grp_product', 'grp_research'], 'grp_product')).toBe(
      'grp_product'
    );
    expect(resolveActiveGroupId(null, ['grp_product', 'grp_research'], 'grp_product')).toBe(
      'grp_product'
    );
  });
});
