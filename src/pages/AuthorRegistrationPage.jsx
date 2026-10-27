import { useState } from "react";
import { PERMISSIONS as P } from "../data/libraryPermissions";
import { runLibraryCommand, useLibraryData } from "../ui/libraryStore";
import { t } from "../ui/settings";
import "./ReaderPages.css";

const statusLabels = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Bị từ chối",
};

export default function AuthorRegistrationPage({ user }) {
  const data = useLibraryData();
  const [error, setError] = useState("");

  const application = (data.authorApplications || []).find(
    (item) => item.readerEmail === user.email,
  );

  const canEdit =
    user.role === "reader" &&
    (!application || application.status === "rejected");

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const form = new FormData(event.currentTarget);

    const values = {
      fullName: String(form.get("fullName") || "").trim(),
      penName: String(form.get("penName") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      bio: String(form.get("bio") || "").trim(),
      portfolioUrl: String(form.get("portfolioUrl") || "").trim(),
    };

    if (
      values.fullName.length < 2 ||
      values.fullName.length > 100 ||
      values.penName.length < 2 ||
      values.penName.length > 100 ||
      values.bio.length < 30 ||
      values.bio.length > 2000
    ) {
      setError("Kiểm tra họ tên, bút danh và phần giới thiệu nhé.");
      return;
    }

    const phone = values.phone.replace(/[\s().-]/g, "");

    if (!/^\+?[0-9]{9,15}$/.test(phone)) {
      setError("Số điện thoại cần có từ 9 đến 15 chữ số.");
      return;
    }

    try {
      const url = new URL(values.portfolioUrl);

      if (
        url.protocol !== "https:" ||
        !url.hostname ||
        url.username ||
        url.password ||
        values.portfolioUrl.length > 500
      ) {
        throw new Error("invalidUrl");
      }
    } catch {
      setError("Nhập liên kết minh chứng hợp lệ, bắt đầu bằng https://.");
      return;
    }

    if (form.get("confirmation") !== "on") {
      setError("Vui lòng xác nhận thông tin trước khi gửi.");
      return;
    }

    const result = runLibraryCommand(P.PROFILE_OWN, (state, actor) => {
      // Kiểm tra lại phiên đăng nhập tại thời điểm gửi.
      if (actor.email !== user.email || actor.role !== "reader") {
        return { ok: false, error: "forbidden" };
      }

      const applications = state.authorApplications || [];

      const previous = applications.find(
        (item) => item.readerEmail === actor.email,
      );

      // Chặn gửi trùng, kể cả khi hồ sơ vừa đổi ở tab khác.
      if (previous && previous.status !== "rejected") {
        return { ok: false, error: "alreadySubmitted" };
      }

      const now = new Date().toISOString();

      const nextApplication = {
        id: previous?.id || crypto.randomUUID(),
        readerEmail: actor.email,
        ...values,
        phone,
        status: "pending",
        createdAt: previous?.createdAt || now,
        submittedAt: now,
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: "",
      };

      return {
        ok: true,
        targetId: nextApplication.id,
        details: {
          action: "author.application.submit",
          status: "pending",
        },
        state: {
          ...state,
          authorApplications: [
            ...applications.filter((item) => item.readerEmail !== actor.email),
            nextApplication,
          ],
        },
      };
    });

    if (!result.ok) {
      setError(
        result.error === "alreadySubmitted"
          ? "Hồ sơ đã được gửi. Vui lòng kiểm tra trạng thái."
          : "Không thể gửi hồ sơ. Kiểm tra lại tài khoản đăng nhập.",
      );
    }
  }

  return (
    <section className="reader-page" aria-label={t("Đăng ký tác giả")}>
      <p className="reader-note">
        {t(
          "Gửi hồ sơ để admin xem xét cấp quyền tác giả. Bản demo lưu hồ sơ trong trình duyệt này.",
        )}
      </p>

      <div className="reader-panel">
        <div className="reader-panel-heading">
          <h2>{t("Hồ sơ đăng ký tác giả")}</h2>
          <span className="reader-badge" role="status">
            {t(
              application ? statusLabels[application.status] : "Chưa gửi hồ sơ",
            )}
          </span>
        </div>

        {application?.status === "pending" && (
          <p className="reader-note">
            {t(
              "Đã nhận hồ sơ. Tài khoản vẫn giữ quyền độc giả trong lúc chờ admin duyệt.",
            )}
          </p>
        )}

        {application?.status === "approved" && (
          <p className="reader-note">{t("Hồ sơ đã được admin duyệt.")}</p>
        )}

        {application?.status === "rejected" && (
          <p className="reader-note">
            {t("Lý do từ chối")}:{" "}
            {application.rejectionReason || t("Chưa có lý do được ghi nhận.")}{" "}
            {t("Bạn có thể chỉnh sửa hồ sơ và gửi lại.")}
          </p>
        )}

        <form
          key={application?.submittedAt || "new"}
          className="reader-profile-form"
          onSubmit={handleSubmit}
        >
          <label className="reader-field">
            <span>{t("Họ và tên")}</span>
            <input
              name="fullName"
              autoComplete="name"
              defaultValue={application?.fullName || user.fullName || ""}
              minLength={2}
              maxLength={100}
              disabled={!canEdit}
              required
            />
          </label>

          <label className="reader-field">
            <span>{t("Email")}</span>
            <input type="email" value={user.email} readOnly />
          </label>

          <label className="reader-field">
            <span>{t("Bút danh")}</span>
            <input
              name="penName"
              defaultValue={application?.penName || ""}
              minLength={2}
              maxLength={100}
              disabled={!canEdit}
              required
            />
          </label>

          <label className="reader-field">
            <span>{t("Số điện thoại")}</span>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              defaultValue={application?.phone || ""}
              maxLength={30}
              disabled={!canEdit}
              required
            />
          </label>

          <label className="reader-field">
            <span>{t("Giới thiệu tác giả (30–2000 ký tự)")}</span>
            <textarea
              name="bio"
              rows={5}
              defaultValue={application?.bio || ""}
              minLength={30}
              maxLength={2000}
              disabled={!canEdit}
              required
            />
          </label>

          <label className="reader-field">
            <span>{t("Liên kết tác phẩm hoặc hồ sơ tác giả")}</span>
            <input
              name="portfolioUrl"
              type="url"
              placeholder="https://..."
              defaultValue={application?.portfolioUrl || ""}
              maxLength={500}
              disabled={!canEdit}
              required
            />
          </label>

          {canEdit && (
            <>
              <label className="reader-muted">
                <input name="confirmation" type="checkbox" required />{" "}
                {t("Tôi xác nhận thông tin cung cấp là chính xác.")}
              </label>

              <div className="reader-profile-actions">
                <button className="reader-button" type="submit">
                  {t(
                    application?.status === "rejected"
                      ? "Gửi lại hồ sơ"
                      : "Gửi hồ sơ đăng ký",
                  )}
                </button>
              </div>
            </>
          )}
        </form>

        <p className="reader-status" role="alert">
          {t(error)}
        </p>
      </div>
    </section>
  );
}
