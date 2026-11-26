import { normalizeLibrarySettings } from "../data/librarySettings.js";
import { runLibraryCommand, useLibraryData } from "./libraryStore.js";
export function useLibrarySettings() {
  const data = useLibraryData();
  return { ...normalizeLibrarySettings(data.settings), ...data.settings };
}
export function saveLibrarySettings(input,expectedSettings) {
  return runLibraryCommand("settings.save", {...input,expectedVersion:expectedSettings?.version||0});
}
