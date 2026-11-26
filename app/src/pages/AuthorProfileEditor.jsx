import { t } from "../ui/settings.js";
import { useState } from "react";
import { runLibraryCommand } from "../ui/libraryStore.js";
export default function AuthorProfileEditor({ profile }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const result = await runLibraryCommand(
      "author.profile",
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    setMessage(result.ok ? t("Đã cập nhật hồ sơ công khai.") : result.message);
    setBusy(false);
  }
  return (
    <form className="author-profile-edit" onSubmit={submit}>
      <h3>{t("Cập nhật hồ sơ công khai")}</h3>
      <label>
        {" " + t("Bút danh") + " "}
        <input
          name="penName"
          defaultValue={profile.penName}
          required
          minLength={2}
          maxLength={100}
        />
      </label>
      <label>
        {" " + t("Giới thiệu") + " "}
        <textarea
          name="bio"
          defaultValue={profile.bio}
          required
          minLength={30}
          maxLength={2000}
          rows={5}
        />
      </label>
      <button className="reader-button" disabled={busy}>
        {" " + t("Lưu hồ sơ tác giả") + " "}
      </button>
      <p role="status">{t(message)}</p>
    </form>
  );
}
