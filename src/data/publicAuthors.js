export function normalizeAuthorSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim()
    .replace(/\s+/g, " ");
}

export function getPublicAuthors(state, catalogBooks = state.books) {
  // Dùng số bản còn sẵn đã được tính theo luồng mượn–trả.
  const stock = new Map(
    catalogBooks.map((book) => [book.id, book.availableCopies]),
  );

  const profiles = state.authorApplications || [];

  return state.accounts
    .filter(
      (account) => account.role === "author" && account.status === "active",
    )
    .map((account) => {
      const profile = profiles.find(
        (item) =>
          item.readerEmail === account.email && item.status === "approved",
      );

      if (
        !profile ||
        typeof profile.penName !== "string" ||
        !profile.penName.trim()
      ) {
        return null;
      }

      const books = state.books
        .filter((book) => !book.archived && book.authorEmail === account.email)
        .map((book) => ({
          id: book.id,
          title: book.title,
          author: book.author,
          category: book.category,
          cover: book.cover,
          isbn: book.isbn,
          description: book.description,
          pdfUrl: book.pdfUrl,
          pageCount: book.pageCount,

          availableCopies: stock.get(book.id) ?? book.availableCopies,
        }));

      if (!books.length) {
        return null;
      }

      return {
        id: profile.id,
        name: profile.penName.trim(),

        categories: [
          ...new Set(books.map((book) => book.category).filter(Boolean)),
        ],

        books,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
}
