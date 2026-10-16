import useStoredState from "./useStoredState";

export function profileStorageKey(email) {
  return "cloudlibrary:demo-profile:" + email.toLowerCase() + ":v1";
}

export default function useDemoAuth() {
  const [session, setSession] = useStoredState(
    "cloudlibrary:demo-session:v1",
    null,
  );

  const user =
    session &&
    typeof session.email === "string" &&
    typeof session.fullName === "string"
      ? session
      : null;

  function signInDemo({ email, fullName = "" }) {
    const normalizedEmail = email.trim().toLowerCase();
    const key = profileStorageKey(normalizedEmail);

    let savedProfile = {};

    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");

      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        savedProfile = saved;
      }
    } catch {
      savedProfile = {};
    }

    const savedName =
      typeof savedProfile.fullName === "string"
        ? savedProfile.fullName.trim()
        : "";

    const nextUser = {
      fullName: fullName.trim() || savedName || normalizedEmail.split("@")[0],
      email: normalizedEmail,
      role: "reader",
    };

    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          ...savedProfile,
          fullName: nextUser.fullName,
          email: nextUser.email,
        }),
      );
    } catch (error) {
      console.warn("Không thể lưu hồ sơ demo:", error);
    }

    setSession(nextUser);

    return nextUser;
  }

  function signOutDemo() {
    setSession(null);
  }

  function updateDemoProfile({ fullName }) {
    setSession((current) =>
      current ? { ...current, fullName: fullName.trim() } : current,
    );
  }

  return {
    user,
    signInDemo,
    signOutDemo,
    updateDemoProfile,
  };
}
