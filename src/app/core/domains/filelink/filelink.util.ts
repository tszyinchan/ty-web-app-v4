import { FilelinkItem } from './filelink.model';

export type FilelinkSortOption =
  | 'custom'
  | 'name-asc'
  | 'name-desc'
  | 'date-desc'
  | 'modified-desc';

/**
 * [純函式] 產生通用的檔案顯示標題
 */
export function buildFileDisplayTitle(
  title?: string | null,
  refDate?: string | null,
  url?: string | null,
): string {
  if (title && refDate) return `${title} (${refDate})`;
  if (title) return title;
  if (refDate) return refDate;
  return url || '未命名文件';
}

/**
 * [純函式] 根據當前路徑，從檔案清單中萃取出當前階層的資料夾與檔案
 */
export function extractFolderContent(
  items: FilelinkItem[],
  currentPath: string[],
) {
  const files: FilelinkItem[] = [];
  const folderSet = new Set<string>();
  const currentDepth = currentPath.length;

  for (const item of items) {
    const itemPath = item.item_path || [];
    let isUnderCurrentPath = true;

    for (let i = 0; i < currentDepth; i++) {
      if (itemPath[i] !== currentPath[i]) {
        isUnderCurrentPath = false;
        break;
      }
    }

    if (!isUnderCurrentPath) continue;

    if (itemPath.length === currentDepth) {
      files.push(item);
    } else if (itemPath.length > currentDepth) {
      folderSet.add(itemPath[currentDepth]);
    }
  }

  return { files, folders: Array.from(folderSet) };
}

/**
 * [純函式] 針對資料夾與檔案進行排序
 */
export function sortExplorerContent<
  T extends {
    displayTitle: string;
    sort_order: number;
    ref_date?: string | null;
    updated_at?: string;
    created_at?: string;
  },
>(files: T[], folders: string[], sortType: FilelinkSortOption) {
  const sortedFolders = [...folders].sort();
  if (sortType === 'name-desc') {
    sortedFolders.reverse();
  }

  const sortedFiles = [...files].sort((a, b) => {
    if (sortType === 'custom') {
      return a.sort_order - b.sort_order;
    } else if (sortType === 'name-asc') {
      return a.displayTitle.localeCompare(b.displayTitle);
    } else if (sortType === 'name-desc') {
      return b.displayTitle.localeCompare(a.displayTitle);
    } else if (sortType === 'date-desc') {
      const dA = a.ref_date || '';
      const dB = b.ref_date || '';
      if (!dA && !dB) return a.sort_order - b.sort_order;
      if (!dA) return 1;
      if (!dB) return -1;
      return dB.localeCompare(dA);
    } else if (sortType === 'modified-desc') {
      const modA = a.updated_at || a.created_at || '';
      const modB = b.updated_at || b.created_at || '';
      return modB.localeCompare(modA);
    }
    return 0;
  });

  return { folders: sortedFolders, files: sortedFiles };
}
