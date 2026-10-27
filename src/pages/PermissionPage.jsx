import { Check, X } from "lucide-react";

import { PERMISSIONS as P, ROLE_PERMISSIONS } from "../data/libraryPermissions";

import { useUiSettings } from "../ui/settings";

import "./PermissionPage.css";

const rows = [
  [P.DASHBOARD, "Xem tổng quan nghiệp vụ", "View operational dashboard"],
  [P.CATALOG, "Xem danh mục sách", "View book catalog"],
  [P.BOOKS_MANAGE, "Thêm, sửa, ngừng lưu hành sách", "Manage catalog books"],
  [
    P.READERS_READ,
    "Xem thông tin độc giả để giao/nhận sách",
    "View readers for handovers and returns",
  ],
  [
    P.READERS_MANAGE,
    "Quản lý đầy đủ hồ sơ độc giả",
    "Manage full reader profiles",
  ],
  [P.LOANS_READ, "Xem phiếu mượn trả", "View borrowing records"],
  [P.LOAN_APPROVE, "Duyệt yêu cầu mượn", "Approve borrow requests"],
  [P.LOAN_REJECT, "Từ chối yêu cầu", "Reject requests"],
  [P.LOAN_HANDOVER, "Bàn giao sách", "Hand over books"],
  [P.LOAN_RETURN, "Nhận trả sách", "Record book returns"],
  [
    P.ACCOUNTS_MANAGE,
    "Quản lý nhân sự và vai trò",
    "Manage staff accounts and roles",
  ],
  [P.SETTINGS_MANAGE, "Thay đổi quy định thư viện", "Change library settings"],
  [P.AUDIT_OWN, "Xem lịch sử thao tác của mình", "View own activity history"],
  [
    P.AUDIT_ALL,
    "Xem lịch sử thao tác toàn bộ nhân sự",
    "View all staff activity history",
  ],
  [P.ACCESS_OWN, "Xem lịch sử truy cập của mình", "View own access history"],
  [
    P.ACCESS_ALL,
    "Xem lịch sử truy cập toàn bộ nhân sự",
    "View all staff access history",
  ],
  [P.REPORTS_READ, "Xem báo cáo nghiệp vụ", "View operational reports"],
  [P.REPORTS_EXPORT, "Xuất báo cáo", "Export reports"],
];

export default function PermissionPage({ user }) {
  const { language } = useUiSettings();
  const vi = language === "vi";

  return (
    <section
      className="management-permissions"
      aria-label={vi ? "Quyền tài khoản" : "Account permissions"}
    >
      <div className="management-permission-heading">
        <h2>{vi ? "Quyền tài khoản" : "Account permissions"}</h2>

        <p>
          {user.email} ·{" "}
          {user.role === "admin"
            ? vi
              ? "Quản trị viên"
              : "Administrator"
            : vi
              ? "Thủ thư"
              : "Librarian"}
        </p>
      </div>

      <div className="management-permission-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">{vi ? "Chức năng" : "Function"}</th>
              <th scope="col">Admin</th>
              <th scope="col">{vi ? "Thủ thư" : "Librarian"}</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(([permission, labelVi, labelEn]) => (
              <tr key={permission}>
                <th scope="row">{vi ? labelVi : labelEn}</th>

                {["admin", "librarian"].map((role) => {
                  const allowed = ROLE_PERMISSIONS[role].includes(permission);

                  return (
                    <td key={role}>
                      <span
                        className={`management-permission-value ${
                          allowed ? "is-allowed" : ""
                        }`}
                      >
                        <span aria-hidden="true">
                          {allowed ? <Check size={16} /> : <X size={16} />}
                        </span>

                        {allowed
                          ? vi
                            ? "Được phép"
                            : "Allowed"
                          : vi
                            ? "Không"
                            : "No"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
