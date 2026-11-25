import {
  normalizeLibrarySettings,
  validateLibrarySettings,
} from "../data/librarySettings.js";

import { PERMISSIONS as P } from "../data/libraryPermissions.js";

import { runLibraryCommand, useLibraryData } from "./libraryStore.js";

export function useLibrarySettings() {
  return normalizeLibrarySettings(useLibraryData().settings);
}

export function saveLibrarySettings(input, expectedSettings) {
  return runLibraryCommand(P.SETTINGS_MANAGE, (state) => {
    const before = normalizeLibrarySettings(state.settings);

    if (
      expectedSettings &&
      JSON.stringify(before) !==
        JSON.stringify(normalizeLibrarySettings(expectedSettings))
    ) {
      return {
        ok: false,
        error: "settingsConflict",
      };
    }

    const result = validateLibrarySettings(input);

    if (!result.ok) return result;

    return {
      ok: true,
      targetId: "library",

      details: {
        operation: "settings.manage",
        before,
        after: result.settings,
      },

      state: {
        ...state,
        settings: result.settings,
      },
    };
  });
}
