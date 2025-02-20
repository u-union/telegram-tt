
/**
 * FolderMenuHelper.ts
 * Load/save folder details to local storage
 * Temporary solution until icons details can be saved inside Folders entities
 */

const FOLDER_DETAILS_PREFIX = 'tt-folder-details-';

export type FolderIconType = "emoji" | "icon" | "custom-emoji";

export type FolderDetails = {
  iconType?: FolderIconType;
  icon?: string;
  documentId?: string;
};

export function saveFolderDetails(key: number, data: FolderDetails) {
  localStorage.setItem(
    FOLDER_DETAILS_PREFIX + key, 
    JSON.stringify(data)
  );
}

export function loadFolderDetails(key: number): FolderDetails | null {
  const stored = localStorage.getItem(FOLDER_DETAILS_PREFIX + key);
  return stored ? JSON.parse(stored) : null;
}