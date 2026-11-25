import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.mjs";
import { passwordHash } from "./auth.mjs";
import { syncCopies } from "./library.mjs";

export const localAccounts = [
  {
    id: "local-admin",
    email: "admin@cloudlibrary.demo",
    fullName: "Quản trị viên",
    role: "admin",
    password: "AdminDemo123!",
  },
  {
    id: "local-librarian",
    email: "librarian@cloudlibrary.demo",
    fullName: "Thủ thư",
    role: "librarian",
    password: "LibraryDemo123!",
  },
  {
    id: "local-reader",
    email: "reader@cloudlibrary.demo",
    fullName: "Độc giả trải nghiệm",
    role: "reader",
    password: "ReaderDemo123!",
  },
  {
    id: "local-author",
    email: "author@cloudlibrary.demo",
    fullName: "Tác giả trải nghiệm",
    role: "author",
    password: "AuthorDemo123!",
  },
];
const stamp = "2026-11-19T00:00:00.000Z";
export async function seedRepository(repo, options = config) {
  const current = await repo.read();
  if (current.version > 0) return;
  if (options.mode === "local")
    for (const account of localAccounts)
      await repo.putSecret(
        `AUTH#${account.email}`,
        "CREDENTIAL",
        passwordHash(account.password),
      );
  const pdf = await readFile(
    path.resolve(
      process.env.LAMBDA_TASK_ROOT || "server",
      "fixtures/cloud-library-guide.pdf",
    ),
  ).catch(() => null);
  if (pdf)
    await repo.storage.put(
      "seed/cloud-library-guide.pdf",
      pdf,
      "application/pdf",
    );
  await repo.mutate(
    "system",
    "initial_library_setup_v1",
    { action: "seed", mode: options.mode },
    (state) => {
      state.categories = [
        { id: "category-aws", name: "Điện toán đám mây", aliases: [] },
        { id: "category-guide", name: "Hướng dẫn sử dụng", aliases: [] },
        { id: "category-programming", name: "Lập trình", aliases: [] },
      ];
      state.books = [
        {
          id: "aws-foundations",
          title: "Bắt đầu với điện toán đám mây AWS",
          author: "Cloud Library",
          category: "Điện toán đám mây",
          description:
            "Tài liệu nhập môn do dự án biên soạn, giải thích trách nhiệm của S3, CloudFront, Cognito, Lambda và DynamoDB trong một ứng dụng thư viện.",
          availableCopies: 3,
          totalCopies: 3,
          isFeatured: true,
          visibility: "published",
          viewCount: 0,
          publishedAt: stamp,
          publishedRevisionId: "aws-foundations-v1",
          archived: false,
          cover: "",
          chapters: [
            {
              id: "cloud-1",
              title: "Từ trình duyệt đến dữ liệu",
              content:
                "Một ứng dụng thư viện bắt đầu từ nhu cầu của độc giả: tìm đúng sách, biết số bản còn sẵn và theo dõi hạn trả. Trình duyệt trình bày giao diện, còn máy chủ xác minh danh tính và quyết định thao tác nào được phép.\n\nS3 lưu các tệp tĩnh và tài liệu. CloudFront phân phối giao diện qua HTTPS. Cognito quản lý định danh. API Gateway tiếp nhận yêu cầu có token. Lambda xử lý nghiệp vụ và DynamoDB lưu các bản ghi.\n\nDữ liệu nhạy cảm không nằm trong mã giao diện. Người dùng chỉ xem các thông tin thuộc quyền của mình.",
            },
            {
              id: "cloud-2",
              title: "Giữ đúng số lượng sách",
              content:
                "Một yêu cầu đang chờ duyệt chưa giữ bản sách. Khi thủ thư duyệt, hệ thống phải kiểm tra lại số bản còn sẵn và giữ đúng một bản trong cùng giao dịch.\n\nHai người cùng xin mượn bản cuối không được cùng thành công. Khi nhận trả, phiếu và bản sách phải được cập nhật một lần; yêu cầu gửi lặp phải trả lại kết quả đã có.\n\nNếu có hàng chờ đặt trước, bản vừa trả được giữ cho người đầu hàng trong thời gian quy định.",
            },
          ],
        },
        {
          id: "library-guide",
          title: "Hướng dẫn sử dụng Cloud Library",
          author: "Cloud Library",
          category: "Hướng dẫn sử dụng",
          description:
            "Hướng dẫn đọc PDF, đọc theo chương, lưu tiến độ, gửi yêu cầu mượn và theo dõi các thông báo của thư viện.",
          availableCopies: 2,
          totalCopies: 2,
          isFeatured: true,
          visibility: "published",
          viewCount: 0,
          publishedAt: stamp,
          publishedRevisionId: "library-guide-v1",
          archived: false,
          cover: "",
          ...(pdf ? { pdfKey: "seed/cloud-library-guide.pdf" } : {}),
          chapters: [
            {
              id: "guide-1",
              title: "Tìm và đọc tác phẩm",
              content:
                "Bạn có thể tìm theo tên sách hoặc tác giả, dùng từ khóa có dấu hoặc không dấu. Các bộ lọc thể loại, định dạng và tình trạng bản giấy giúp thu hẹp kết quả.\n\nĐăng nhập để đọc toàn văn. Trong trình đọc, bạn có thể chọn PDF hoặc chương, thay đổi cỡ chữ, nền, giãn dòng và cách chuyển trang. Tiến độ được lưu trên máy chủ theo tài khoản và phiên bản tác phẩm.",
            },
            {
              id: "guide-2",
              title: "Mượn, gia hạn và trả sách",
              content:
                "Gửi yêu cầu mượn từ chi tiết tác phẩm. Thủ thư duyệt yêu cầu và xác nhận bàn giao khi bạn đến nhận sách. Hạn trả được tính theo cấu hình tại thời điểm bàn giao.\n\nBạn có thể hủy trước khi nhận sách. Nếu cần gia hạn, gửi yêu cầu khi chưa quá hạn và không có người đặt trước. Thủ thư sẽ xét duyệt. Khi trả sách tại quầy, thủ thư xác nhận để hoàn tất phiếu.",
            },
          ],
        },
        {
          id: "data-design",
          title: "Thiết kế dữ liệu cho ứng dụng thư viện",
          author: "Cloud Library",
          category: "Lập trình",
          description:
            "Các nguyên tắc thiết kế dữ liệu, quyền sở hữu, phiên bản nội dung và kiểm thử thao tác đồng thời trong dự án thư viện.",
          availableCopies: 1,
          totalCopies: 1,
          visibility: "published",
          viewCount: 0,
          publishedAt: stamp,
          publishedRevisionId: "data-design-v1",
          archived: false,
          cover: "",
          chapters: [
            {
              id: "data-1",
              title: "Định danh và quyền sở hữu",
              content:
                "Mỗi tài khoản, đầu sách, phiếu mượn và phiên bản nội dung cần một định danh ổn định. Email là thông tin liên hệ, không phải khóa thay thế cho mọi quan hệ.\n\nMáy chủ xác định người thao tác từ phiên đã được xác thực, sau đó kiểm tra vai trò và quyền sở hữu. Việc ẩn một nút trên giao diện chỉ hỗ trợ trải nghiệm, không thay thế kiểm tra tại API.\n\nMột bản sửa được xuất bản cần có lịch sử riêng. Bản công khai cũ tiếp tục phục vụ cho đến khi bản mới được duyệt.",
            },
          ],
        },
      ];
      state.books.forEach((book) => syncCopies(state, book));
      state.knowledgeSources = [
        {
          id: "library-policy",
          title: "Nội quy Cloud Library",
          content:
            "Độc giả cần đăng nhập trước khi đọc toàn văn và mượn sách. Phiếu đang chờ, đã duyệt và đang mượn đều tính vào giới hạn. Chỉ thủ thư và quản trị viên được xác nhận giao nhận. Tác giả gửi nội dung để quản trị viên xét duyệt, không tự xuất bản. Chính sách hạn mượn, gia hạn, giữ sách và tiền phạt lấy từ cấu hình hiện hành.",
          approved: true,
          version: 1,
          updatedAt: stamp,
        },
      ];
      if (options.mode === "local") {
        state.accounts = localAccounts.map(
          ({ password: _password, ...account }) => ({
            ...account,
            status: "active",
            createdAt: stamp,
          }),
        );
        state.authorApplications = [
          {
            id: "local-author-profile",
            readerEmail: "author@cloudlibrary.demo",
            fullName: "Tác giả trải nghiệm",
            penName: "Tác giả Cloud Library",
            phone: "0900000000",
            bio: "Hồ sơ thử nghiệm dành cho quy trình đóng góp và xét duyệt tác phẩm của Cloud Library.",
            portfolioUrl: "https://cloudjourney.awsfcaj.com/",
            status: "approved",
            submittedAt: stamp,
            reviewedAt: stamp,
            reviewedBy: "local-admin",
          },
        ];
      }
      return { state, result: { initialized: true } };
    },
  );
}
