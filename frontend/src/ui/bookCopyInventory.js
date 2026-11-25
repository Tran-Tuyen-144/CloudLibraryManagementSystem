
export function copyTotal(book) {
  const value = Number(book?.availableCopies);

  return Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

export function maintenanceSlots(book) {
  const total = copyTotal(book);

  return new Set(
    (
      Array.isArray(book?.maintenanceCopySlots)
        ? book.maintenanceCopySlots
        : []
    ).filter(
      (slot) =>
        Number.isInteger(slot) &&
        slot >= 0 &&
        slot < total,
    ),
  );
}

export function demoCopyCode(bookId, slot) {
  let hash = 2166136261;

  for (const char of String(bookId)) {
    hash = Math.imul(
      hash ^ char.charCodeAt(0),
      16777619,
    );
  }

  return `CL-${(hash >>> 0)
    .toString(16)
    .toUpperCase()
    .padStart(8, "0")}-${String(slot + 1).padStart(5, "0")}`;
}

// Phiếu mới có copySlot cố định.
// Phiếu cũ chưa có copySlot sẽ được phân
// vào vị trí trống, không đè lên phiếu mới.
export function deriveDemoBookCopies(
  books = [],
  loanRows = [],
) {
  const loansByBook = new Map();

  for (const loan of loanRows) {
    if (
      !["approved", "borrowed"].includes(
        loan?.status,
      )
    ) {
      continue;
    }

    const group =
      loansByBook.get(loan.bookId) || [];

    group.push(loan);

    loansByBook.set(
      loan.bookId,
      group,
    );
  }

  const copies = [];

  for (const book of books) {
    const total = copyTotal(book);
    const blocked = maintenanceSlots(book);

    const occupied = new Map();
    const unbound = [];

    const loans = (
      loansByBook.get(book.id) || []
    ).sort(
      (a, b) =>
        String(
          a.approvedAt ||
          a.createdAt ||
          "",
        ).localeCompare(
          String(
            b.approvedAt ||
            b.createdAt ||
            "",
          ),
        ) ||
        String(a.id).localeCompare(
          String(b.id),
        ),
    );

    // Ưu tiên các phiếu đã gắn bản cụ thể.
    for (const loan of loans) {
      const slot = loan.copySlot;

      if (
        Number.isInteger(slot) &&
        slot >= 0 &&
        slot < total &&
        !blocked.has(slot) &&
        !occupied.has(slot)
      ) {
        occupied.set(slot, loan);
      } else {
        unbound.push(loan);
      }
    }

    // Phiếu cũ lấy các bản chưa có ai sử dụng.
    let candidate = 0;

    for (const loan of unbound) {
      while (
        candidate < total &&
        (
          blocked.has(candidate) ||
          occupied.has(candidate)
        )
      ) {
        candidate++;
      }

      if (candidate === total) {
        break;
      }

      occupied.set(
        candidate++,
        loan,
      );
    }

    for (
      let slot = 0;
      slot < total;
      slot++
    ) {
      const loan = occupied.get(slot);

      const code = demoCopyCode(
        book.id,
        slot,
      );

      copies.push({
        id: code,
        code,
        bookId: book.id,
        slot,

        status: blocked.has(slot)
          ? "maintenance"
          : loan?.status === "approved"
            ? "reserved"
            : loan?.status === "borrowed"
              ? "borrowed"
              : "available",

        ...(loan
          ? {
              loanId: loan.id,
              readerEmail:
                loan.readerEmail,
            }
          : {}),
      });
    }
  }

  return copies;
}

export function nextAvailableCopySlot(
  book,
  loanRows,
) {
  return deriveDemoBookCopies(
    [book],
    loanRows,
  ).find(
    (copy) =>
      copy.status === "available",
  )?.slot ?? null;
}

// Khi sửa bảo trì, khóa vị trí bản sách
// của các phiếu cũ trước khi đổi tồn kho.
export function freezeLegacyCopySlots(
  requestsByEmail,
  bookId,
  projectedCopies,
) {
  const byLoan = new Map(
    projectedCopies
      .filter((copy) => copy.loanId)
      .map((copy) => [
        `${copy.readerEmail}:${copy.loanId}`,
        copy.slot,
      ]),
  );

  return Object.fromEntries(
    Object.entries(
      requestsByEmail,
    ).map(([email, loans]) => [
      email,

      loans.map((loan) => {
        if (
          loan.bookId !== bookId ||
          ![
            "approved",
            "borrowed",
          ].includes(loan.status)
        ) {
          return loan;
        }

        const slot = byLoan.get(
          `${email}:${loan.id}`,
        );

        return slot === undefined ||
          loan.copySlot === slot
          ? loan
          : {
              ...loan,
              copySlot: slot,
            };
      }),
    ]),
  );
}
