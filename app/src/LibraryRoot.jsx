import { t } from "./ui/settings.js";
import { useEffect } from "react";
import App from "./App.jsx";
import { refreshLibrary, useConnection, setNotice } from "./ui/libraryStore.js";
import { finishCognitoSignIn } from "./api/cognito.js";
export default function LibraryRoot() {
  const state = useConnection();
  useEffect(() => {
    finishCognitoSignIn()
      .catch((error) => setNotice(error.message))
      .then(() => refreshLibrary());
    const refresh = () => {
      if (document.visibilityState === "visible") refreshLibrary();
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  if (state.loading || state.error)
    return (
      <main className="connection-screen">
        <h1>Cloud Library</h1>
        <p role="status">
          {state.loading ? t("Đang kết nối thư viện…") : state.error}
        </p>
        {state.error && (
          <button onClick={refreshLibrary}>{t("Kết nối lại")}</button>
        )}
      </main>
    );
  return (
    <>
      <App />
      {state.pending > 0 && (
        <div className="server-progress" role="status">
          {" " + t("Đang lưu thay đổi…") + " "}
        </div>
      )}
      {state.notice && (
        <div className="server-notice" role="alert">
          {state.notice}
          <button
            onClick={() => setNotice("")}
            aria-label={t("Đóng thông báo")}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
