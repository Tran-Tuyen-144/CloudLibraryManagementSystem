export const authorErrors = {
  editorOpen: [
    "Bạn đang chỉnh sửa bản thảo. Lưu hoặc hủy chỉnh sửa trước khi gửi duyệt.",
    "Save or cancel your edits before submitting for review.",
  ],
  categoryMissing: [
    "Chọn thể loại có sẵn hoặc thêm thể loại trước khi lưu.",
    "Choose an existing category or add one before saving.",
  ],
  incompleteManuscript: [
    "Cần tên tác phẩm, thể loại, giới thiệu từ 30 ký tự và nội dung chương hoặc PDF trước khi gửi duyệt.",
    "Add a title, category, a description of at least 30 characters, and chapters or a PDF before submitting.",
  ],
  incompleteChapters: [
    "Mỗi chương cần có tên và nội dung trước khi gửi duyệt. Hãy hoàn thiện hoặc xóa chương đang để trống.",
    "Every chapter needs a title and content before submission. Complete or remove empty chapters.",
  ],
  invalidChapters: [
    "Kiểm tra lại chương: tối đa 100 chương, 160 ký tự cho tên, 50.000 ký tự mỗi chương và 500.000 ký tự nội dung toàn tác phẩm.",
    "Check the chapters: up to 100 chapters, 160 characters per title, 50,000 characters per chapter, and 500,000 content characters overall.",
  ],
  invalidCover: [
    "Ảnh bìa cần liên kết http:// hoặc https:// hợp lệ, tối đa 2000 ký tự và không chứa thông tin đăng nhập.",
    "Use a valid http:// or https:// cover URL, up to 2,000 characters, without embedded credentials.",
  ],
  forbidden: [
    "Bạn chưa có quyền tác giả được duyệt.",
    "Approved author access is required.",
  ],
  staleDraft: [
    "Bản thảo đã thay đổi hoặc không còn được sửa. Đóng form và mở lại bản thảo.",
    "The draft changed or can no longer be edited. Close and reopen the draft.",
  ],
  invalidDraft: [
    "Tên tác phẩm cần từ 2–160 ký tự, thể loại tối đa 80 ký tự và giới thiệu tối đa 3000 ký tự.",
    "Use a 2–160 character title, a category of up to 80 characters, and a description of up to 3,000 characters.",
  ],
  invalidUrl: [
    "Liên kết PDF cần bắt đầu bằng https://, tối đa 1000 ký tự và không chứa thông tin đăng nhập.",
    "The PDF URL must use https://, contain at most 1,000 characters, and have no embedded credentials.",
  ],
  loginRequired: ["Vui lòng đăng nhập lại.", "Please sign in again."],
  storageFailed: [
    "Chưa lưu được thay đổi trên trình duyệt. Giữ trang hiện tại, giảm dung lượng hoặc giải phóng bộ nhớ rồi thử lại.",
    "The browser could not save these changes. Keep this page open, reduce the size or free browser storage, and retry.",
  ],
  noPreviewContent: [
    "Thêm nội dung cho ít nhất một chương hoặc liên kết PDF để xem trước.",
    "Add content to at least one chapter or provide a PDF link to preview.",
  ],
};

export function authorErrorMessage(code, language) {
  const values = authorErrors[code] || [
    "Chưa thực hiện được thao tác. Hãy thử lại.",
    "Unable to complete this action. Please retry.",
  ];

  return values[language === "en" ? 1 : 0];
}