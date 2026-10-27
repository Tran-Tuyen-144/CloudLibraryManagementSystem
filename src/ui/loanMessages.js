import { normalizeLibrarySettings } from "../data/librarySettings.js";

export const loanMessages = {
  vi: {
    forbidden: "Bạn không có quyền thực hiện thao tác này.",
    staffRequired:
      "Đăng nhập tài khoản quản trị hoặc thủ thư để xử lý yêu cầu.",

    pending: "Chờ duyệt",
    approved: "Chờ nhận sách",
    borrowed: "Đang mượn",
    returned: "Đã trả",
    rejected: "Từ chối",
    cancelled: "Đã hủy",
    overdue: "Quá hạn",
    all: "Tất cả",
    history: "Lịch sử",
    active: "Phiếu đang hoạt động",

    staffTitle: "Bàn thủ thư",
    demo: "CHẾ ĐỘ DEMO",
    staffIntro: "Theo dõi yêu cầu, bàn giao sách và nhận trả tại một nơi.",

    staffNote:
      "Khu vực thủ thư demo xử lý dữ liệu mượn trả lưu trong trình duyệt. Chưa kết nối hệ thống xác thực và phân quyền.",

    readerNote:
      "Demo frontend: dữ liệu lưu trong trình duyệt. Thủ thư xử lý yêu cầu ở khu vực quản trị riêng. Duyệt sẽ giữ một bản sách; bàn giao mới bắt đầu lượt mượn.",

    queue: "Sổ theo dõi mượn trả",
    results: "phiếu",
    search: "Tìm phiếu",
    searchHint: "Tên sách, tên độc giả hoặc email...",
    filter: "Lọc trạng thái",

    approve: "Duyệt yêu cầu",
    reject: "Từ chối",
    handover: "Bàn giao sách",
    return: "Nhận trả sách",
    cancel: "Đóng",
    confirm: "Xác nhận",
    cancelRequest: "Hủy yêu cầu",

    approveSuccess: "Đã duyệt và giữ một bản sách cho độc giả.",
    rejectSuccess: "Đã từ chối yêu cầu.",
    handoverSuccess: "Đã bàn giao sách và ghi nhận hạn trả.",
    returnSuccess: "Đã nhận trả và cập nhật số bản còn sẵn.",
    cancelSuccess: "Đã hủy yêu cầu và giải phóng bản sách được giữ (nếu có).",

    reason: "Lý do từ chối",
    reasonHint: "Nhập lý do để độc giả biết...",
    reasonRequired: "Vui lòng nhập lý do từ chối.",

    dueDate: "Hạn trả",
    borrowedAt: "Ngày bàn giao",
    approvedAt: "Ngày duyệt",
    returnedAt: "Ngày trả",
    rejectedAt: "Ngày từ chối",
    cancelledAt: "Ngày hủy",
    createdAt: "Ngày yêu cầu",

    handoverHint:
      "Chỉ xác nhận sau khi độc giả đã nhận sách. Mặc định {loanDays} ngày; bạn có thể chọn hạn trả trong 60 ngày tới.",

    returnHint:
      "Xác nhận khi bạn đã nhận lại cuốn sách từ độc giả. Một bản sách sẽ được đưa về danh mục còn sẵn.",

    invalidDueDate: "Chọn ngày hợp lệ từ hôm nay đến 60 ngày tới.",

    staleRequest:
      "Phiếu đã đổi trạng thái hoặc không còn tồn tại. Hãy kiểm tra lại danh sách.",

    unavailable:
      "Không còn bản sách để duyệt. Hãy xử lý các phiếu khác hoặc chờ sách được trả.",

    reader: "Độc giả",
    available: "Bản còn sẵn",
    unknownBook: "Sách không còn trong danh mục",
    note: "Ghi chú",
    open: "Xem phiếu",

    empty: "Chưa có phiếu ở đây",
    emptyHint: "Thử trạng thái khác hoặc thay đổi từ khóa tìm kiếm.",

    seed: "Tạo 3 phiếu mẫu",
    seedHint:
      "Tạo cho bạn đọc mẫu: một phiếu chờ duyệt, một phiếu chờ nhận và một lượt mượn quá hạn. Các phiếu này sẽ được lưu như dữ liệu demo.",
    seeded: "Đã tạo phiếu mẫu cho bạn đọc demo.",

    readerHistory: "Phiếu mượn của tôi",

    limitHint:
      "Tối đa {maxActiveLoans} phiếu đang xử lý hoặc đang mượn cho mỗi email.",

    duplicate: "Bạn đã có phiếu chờ xử lý hoặc đang mượn cuốn sách này.",

    limit:
      "Đã đạt giới hạn phiếu đang xử lý hoặc đang mượn tại thời điểm thực hiện.",
  },

  en: {
    forbidden: "You do not have permission to perform this action.",
    staffRequired:
      "Sign in with an administrator or librarian account to process requests.",

    pending: "Pending",
    approved: "Ready for pickup",
    borrowed: "On loan",
    returned: "Returned",
    rejected: "Rejected",
    cancelled: "Cancelled",
    overdue: "Overdue",
    all: "All",
    history: "History",
    active: "Active requests & loans",

    staffTitle: "Librarian desk",
    demo: "DEMO MODE",
    staffIntro:
      "Review requests, hand over books, and record returns in one place.",

    staffNote:
      "The librarian demo manages borrowing records saved in this browser. Authentication and role permissions are not connected yet.",

    readerNote:
      "Frontend demo: data is saved in this browser. Librarians process requests in a separate management area. Approval reserves a copy; handover starts the loan.",

    queue: "Borrowing register",
    results: "records",
    search: "Search records",
    searchHint: "Book title, reader name or email...",
    filter: "Filter by status",

    approve: "Approve request",
    reject: "Reject",
    handover: "Hand over book",
    return: "Record return",
    cancel: "Close",
    confirm: "Confirm",
    cancelRequest: "Cancel request",

    approveSuccess: "Request approved and one copy reserved.",
    rejectSuccess: "Request rejected.",
    handoverSuccess: "Book handed over and due date saved.",
    returnSuccess: "Return recorded and available copies updated.",
    cancelSuccess: "Request cancelled and any reserved copy released.",

    reason: "Reason for rejection",
    reasonHint: "Let the reader know why...",
    reasonRequired: "Enter a reason for rejection.",

    dueDate: "Due date",
    borrowedAt: "Handed over",
    approvedAt: "Approved",
    returnedAt: "Returned",
    rejectedAt: "Rejected",
    cancelledAt: "Cancelled",
    createdAt: "Requested",

    handoverHint:
      "Confirm once the reader has collected the book. The default is {loanDays} days; you can choose a due date within the next 60 days.",

    returnHint:
      "Confirm once you have received the book from the reader. One copy will become available again.",

    invalidDueDate: "Choose a valid date between today and 60 days from now.",

    staleRequest:
      "This record changed or no longer exists. Check the list again.",

    unavailable:
      "No copy is available to approve this request. Process other records or wait for a return.",

    reader: "Reader",
    available: "Available copies",
    unknownBook: "Book no longer in catalog",
    note: "Note",
    open: "View record",

    empty: "No records here yet",
    emptyHint: "Try another status or change the search terms.",

    seed: "Create 3 sample records",
    seedHint:
      "Create a pending request, an approved request, and an overdue loan for a sample reader. These will be saved as demo records.",
    seeded: "Sample reader records created.",

    readerHistory: "My borrowing records",

    limitHint:
      "Up to {maxActiveLoans} in-progress requests or loans per email.",

    duplicate: "You already have an in-progress request or loan for this book.",

    limit:
      "The active request or loan limit was reached at the time of the action.",
  },
};

export function formatLoanDate(value, language) {
  if (!value) return "—";

  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(language === "en" ? "en-GB" : "vi-VN");
}

export function getLoanMessages(language, settings) {
  const policy = normalizeLibrarySettings(settings);

  return {
    ...Object.fromEntries(
      Object.entries(loanMessages[language]).map(([key, value]) => [
        key,
        value.replace(/\{(maxActiveLoans|loanDays)\}/g, (_, name) =>
          String(policy[name]),
        ),
      ]),
    ),

    limit:
      language === "vi"
        ? `Bạn đã đạt giới hạn ${policy.maxActiveLoans} phiếu đang xử lý hoặc đang mượn.`
        : `You have reached the limit of ${policy.maxActiveLoans} in-progress requests or loans.`,
  };
}
