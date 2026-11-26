const sampleBooks = [
  {
    id: "gatsby",
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    isbn: "9780743273565",
  },
  {
    id: "pride",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    isbn: "9780141439518",
  },
  {
    id: "alchemist",
    title: "The Alchemist",
    author: "Paulo Coelho",
    isbn: "9780061122415",
  },
  {
    id: "midnight",
    title: "The Midnight Library",
    author: "Matt Haig",
    isbn: "9780525559474",
  },
  {
    id: "little-prince",
    title: "The Little Prince",
    author: "Antoine de Saint-Exupéry",
    isbn: "9780156012195",
  },
  {
    id: "atomic-habits",
    title: "Atomic Habits",
    author: "James Clear",
    isbn: "9780735211292",
  },
  {
    id: "norwegian-wood",
    title: "Norwegian Wood",
    author: "Haruki Murakami",
    isbn: "9780375704024",
  },

  {
    id: "reading-demo",
    title: "Tài liệu mẫu: TraceMonkey",
    author: "Andreas Gal và cộng sự",
    category: "Tài liệu mẫu",
    isbn: "",
    cover: "",
    description:
      "Tài liệu PDF dùng để thử chức năng đọc online và lưu mốc đọc.",
    availableCopies: 0,
    pdfUrl:
      "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf",
    pageCount: 14,
  },
];

const bookMetadata = {
  gatsby: {
    category: "Tiểu thuyết",
    availableCopies: 3,
    description:
      "Câu chuyện về tình yêu, tham vọng và giấc mơ Mỹ trong xã hội New York những năm 1920.",
  },
  pride: {
    category: "Tiểu thuyết",
    availableCopies: 2,
    description:
      "Câu chuyện giữa Elizabeth Bennet và Mr. Darcy, cùng những khác biệt về tính cách và định kiến xã hội.",
  },
  alchemist: {
    category: "Tiểu thuyết",
    availableCopies: 0,
    description:
      "Chàng chăn cừu Santiago bắt đầu hành trình tìm kho báu và khám phá ý nghĩa của việc theo đuổi ước mơ.",
  },
  midnight: {
    category: "Tiểu thuyết",
    availableCopies: 4,
    description:
      "Một thư viện nằm giữa sống và chết, nơi mỗi cuốn sách mở ra một cuộc đời khác. Nora khám phá những lựa chọn từng bỏ lỡ và tìm lại ý nghĩa của cuộc sống hiện tại.",
  },
  "little-prince": {
    category: "Thiếu nhi",
    availableCopies: 5,
    description:
      "Hành trình của một hoàng tử nhỏ qua các hành tinh, với những suy ngẫm về tình bạn, tình yêu và cách nhìn thế giới.",
  },
  "atomic-habits": {
    category: "Kỹ năng sống",
    availableCopies: 1,
    description:
      "Những cách xây dựng thói quen tốt và thay đổi hành vi thông qua các bước nhỏ trong cuộc sống hằng ngày.",
  },
  "norwegian-wood": {
    category: "Tiểu thuyết",
    availableCopies: 0,
    description:
      "Một câu chuyện về tuổi trẻ, tình yêu và mất mát, được kể qua những ký ức của Toru Watanabe.",
  },
};

export const books = sampleBooks.map((book) => ({
  ...book,
  ...bookMetadata[book.id],
  cover: `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg?default=false`,
}));
