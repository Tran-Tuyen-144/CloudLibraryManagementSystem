import { currentLibraryUser } from "../data/libraryData.js";
import {
  authenticate,
  logout,
  runLibraryCommand,
  useLibraryData,
} from "../ui/libraryStore.js";
export const profileStorageKey = (email) => `cloudlibrary:profile:${email}`;
export default function useAuth() {
  const data = useLibraryData();
  return {
    user: currentLibraryUser(data),
    signInDemo: authenticate,
    signOutDemo: logout,
    updateDemoProfile: (input) => runLibraryCommand("profile.update", input),
  };
}
