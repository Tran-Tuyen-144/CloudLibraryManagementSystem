export const readerMessages = {
  vi: {
    title: "Đọc sách online",
    back: "Về danh mục",
    open: "Mở PDF ở tab mới",
    pdfMode: "Bản PDF",
    textMode: "Đọc chữ",
    settings: "Cài đặt đọc",
    settingsTitle: "Tùy chỉnh trang đọc",
    font: "Phông chữ",
    serif: "Có chân",
    sans: "Không chân",
    mono: "Đơn cách",
    fontSize: "Cỡ chữ",
    lineHeight: "Giãn dòng",
    pageColor: "Màu trang",
    light: "Trắng",
    sepia: "Giấy ngà",
    dark: "Tối",
    width: "Khổ đọc",
    comfortable: "Vừa",
    wide: "Rộng",
    reset: "Mặc định",
    page: "Trang",
    chapter: "Chương",
    previous: "Trước",
    next: "Tiếp",
    jump: "Đi đến",
    fitWidth: "Vừa chiều rộng",
    zoomIn: "Phóng to",
    zoomOut: "Thu nhỏ",
    loading: "Đang tải PDF…",
    rendering: "Đang tải trang…",
    pdfFailed:
      "Chưa tải được PDF trong trang. Hãy thử lại hoặc mở PDF ở tab mới.",
    passwordFailed:
      "PDF này yêu cầu mật khẩu. Bạn có thể mở PDF ở tab mới để tiếp tục.",
    retry: "Thử lại",
    noText:
      "Trang PDF này không có văn bản để trích. Chuyển sang Bản PDF để đọc trang gốc.",
    textFromPdf: "Văn bản trích từ PDF; bố cục có thể khác trang gốc.",
    pdfNote:
      "PDF giữ phông chữ và màu tài liệu gốc. Tùy chỉnh chữ và màu trang nằm trong chế độ Đọc chữ.",
    missing: "Tác phẩm này chưa có PDF hoặc nội dung chương để đọc.",
    autoSaved: "Đã lưu vị trí đọc",
    noBookmark: "Vị trí đọc sẽ được lưu tự động.",
    storageFailed:
      "Chưa lưu được trên trình duyệt. Hãy kiểm tra dung lượng lưu trữ và thử lại.",
    clear: "Xóa mốc đọc",
    cleared: "Đã xóa mốc đọc.",
    invalidPage: "Nhập số trang hoặc chương hợp lệ.",
    navigation: "Điều hướng nội dung",
    progress: "Tiến độ trong trang/chương",
    textSettingsHint: "Áp dụng cho chế độ Đọc chữ.",
  },

  en: {
    title: "Read online",
    back: "Back to catalog",
    open: "Open PDF in a new tab",
    pdfMode: "PDF",
    textMode: "Text",
    settings: "Reading settings",
    settingsTitle: "Customize your reading page",
    font: "Font",
    serif: "Serif",
    sans: "Sans serif",
    mono: "Monospace",
    fontSize: "Font size",
    lineHeight: "Line spacing",
    pageColor: "Page color",
    light: "White",
    sepia: "Sepia",
    dark: "Dark",
    width: "Reading width",
    comfortable: "Comfortable",
    wide: "Wide",
    reset: "Reset",
    page: "Page",
    chapter: "Chapter",
    previous: "Previous",
    next: "Next",
    jump: "Go",
    fitWidth: "Fit width",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    loading: "Loading PDF…",
    rendering: "Loading page…",
    pdfFailed:
      "The PDF could not be loaded here. Retry or open it in a new tab.",
    passwordFailed:
      "This PDF requires a password. Open it in a new tab to continue.",
    retry: "Retry",
    noText:
      "No text could be extracted from this PDF page. Switch to PDF to read the original page.",
    textFromPdf:
      "Text extracted from the PDF; layout may differ from the original.",
    pdfNote:
      "PDF keeps the original fonts and colors. Font and page-color settings apply in Text mode.",
    missing: "This work has no PDF or chapter content to read yet.",
    autoSaved: "Reading position saved",
    noBookmark: "Your reading position will be saved automatically.",
    storageFailed:
      "Could not save in this browser. Check available storage and retry.",
    clear: "Clear bookmark",
    cleared: "Bookmark cleared.",
    invalidPage: "Enter a valid page or chapter number.",
    navigation: "Reading navigation",
    progress: "Position within the page/chapter",
    textSettingsHint: "Applies in Text mode.",
  },
};

Object.assign(readerMessages.vi, {
  turning: "Cách chuyển trang/chương",
  buttons: "Bấm nút",
  swipe: "Vuốt ngang",
  scroll: "Cuộn dọc liên tục",
  swipeHint:
    "Vuốt trái để đọc tiếp, vuốt phải để quay lại. Có thể dùng phím ← → khi khung đọc được chọn.",
  scrollHint:
    "Kéo xuống để đọc các trang/chương tiếp theo. Vị trí đọc được lưu tự động.",
  end: "Bạn đã đến cuối tác phẩm.",
});

Object.assign(readerMessages.en, {
  turning: "Page/chapter navigation",
  buttons: "Buttons",
  swipe: "Swipe horizontally",
  scroll: "Continuous vertical scroll",
  swipeHint:
    "Swipe left for next, right for previous. Use ← → while the reading area is focused.",
  scrollHint:
    "Scroll down to read the following pages/chapters. Your position is saved automatically.",
  end: "You have reached the end of this work.",
});

Object.assign(readerMessages.vi, {
  backToEditor: "Quay lại bản thảo",
  previewNotice:
    "Đang xem trước nội dung. Lượt xem và mốc đọc không được ghi nhận.",
});

Object.assign(readerMessages.en, {
  backToEditor: "Back to manuscript",
  previewNotice:
    "Content preview. Views and reading bookmarks are not recorded.",
});