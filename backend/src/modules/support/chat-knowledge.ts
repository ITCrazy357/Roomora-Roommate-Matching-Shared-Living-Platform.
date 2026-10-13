export interface HelpArticle {
  id: string;
  topic: string;
  title: string;
  questions: string[];
  answer: string;
  href: string;
}

// Nội dung được đối chiếu với các màn hình và quy tắc hiện có của Roomora.
// AI chỉ chọn ID; câu trả lời và đường dẫn luôn lấy từ danh sách này.
export const helpArticles: HelpArticle[] = [
  {
    id: 'register',
    topic: 'Tài khoản',
    title: 'Tạo tài khoản',
    questions: [
      'Làm sao tạo tài khoản?',
      'Đăng ký Roomora như thế nào?',
      'Tôi muốn đăng ký tài khoản mới',
    ],
    answer:
      'Mở Đăng ký, nhập thông tin được yêu cầu và xác minh email theo hướng dẫn. Sau khi đăng nhập, bạn có thể hoàn thiện hồ sơ và nhu cầu tìm chỗ ở.',
    href: '/dang-ky',
  },
  {
    id: 'password',
    topic: 'Tài khoản',
    title: 'Quên mật khẩu',
    questions: [
      'Tôi quên mật khẩu',
      'Làm sao đặt lại mật khẩu?',
      'Tôi không nhớ password',
      'Reset mật khẩu ở đâu?',
    ],
    answer:
      'Mở Quên mật khẩu, nhập email đã đăng ký rồi làm theo hướng dẫn xác nhận mã và đặt mật khẩu mới. Nếu không nhận được mã hoặc vẫn không vào được tài khoản, hãy gửi yêu cầu hỗ trợ để ADMIN kiểm tra.',
    href: '/quen-mat-khau',
  },
  {
    id: 'profile',
    topic: 'Tài khoản',
    title: 'Chỉnh sửa hồ sơ',
    questions: [
      'Đổi tên hồ sơ ở đâu?',
      'Làm sao cập nhật ảnh đại diện?',
      'Chỉnh sửa hồ sơ cá nhân như thế nào?',
    ],
    answer:
      'Sau khi đăng nhập, mở Hồ sơ của tôi trong menu tài khoản để cập nhật tên hiển thị, ảnh đại diện và thông tin tìm người ở ghép. Kiểm tra lại thông tin rồi lưu thay đổi.',
    href: '/tai-khoan/ho-so',
  },
  {
    id: 'listing_create',
    topic: 'Đăng và tìm tin',
    title: 'Đăng tin',
    questions: [
      'Làm thế nào để đăng tin trên Roomora?',
      'Tôi muốn đăng phòng cho thuê',
      'Hướng dẫn đăng bài tìm người ở ghép',
      'Up bài tìm người ở ghép như thế nào?',
    ],
    answer:
      'Đăng nhập rồi chọn Đăng tin. Chọn loại tin, điền thông tin và hình ảnh, kiểm tra nội dung rồi gửi duyệt. Bạn có thể lưu bản nháp và theo dõi tin trong Tin của tôi; gửi duyệt chưa có nghĩa là tin đã được công khai.',
    href: '/dang-tin',
  },
  {
    id: 'listing_types',
    topic: 'Đăng và tìm tin',
    title: 'Các loại tin',
    questions: [
      'Roomora có những loại tin nào?',
      'Phân biệt tin ở ghép, cho thuê và tìm phòng',
      'Chưa có phòng có thể tìm người ở ghép không?',
    ],
    answer:
      'Roomora có tin tìm người ở ghép, phòng cho thuê và nhu cầu tìm phòng. Với tin ở ghép, bạn có thể chọn đã có phòng hoặc chưa có phòng muốn xin ở ghép. Chọn đúng loại để người xem hiểu nhu cầu của bạn.',
    href: '/dang-tin',
  },
  {
    id: 'listing_find',
    topic: 'Đăng và tìm tin',
    title: 'Tìm tin phù hợp',
    questions: [
      'Làm sao tìm phòng?',
      'Lọc tin theo khu vực và giá như thế nào?',
      'Tôi muốn tìm phòng cho thuê',
      'Tìm tin ở đâu?',
    ],
    answer:
      'Mở Tìm phòng, chọn loại tin rồi dùng bộ lọc khu vực, ngân sách và các tiêu chí phù hợp. Mở chi tiết tin để xem thông tin trước khi kết nối. Trợ lý không kiểm tra tình trạng phòng hay giá thực tế thay cho chủ tin.',
    href: '/tim-phong',
  },
  {
    id: 'listing_mine',
    topic: 'Đăng và tìm tin',
    title: 'Quản lý tin đã đăng',
    questions: [
      'Xem tin của tôi ở đâu?',
      'Làm sao xem trạng thái duyệt tin?',
      'Chỉnh sửa tin đã đăng ở đâu?',
    ],
    answer:
      'Sau khi đăng nhập, mở Tin của tôi trong menu tài khoản để xem trạng thái và các thao tác có thể thực hiện trên từng tin. Nếu tin bị từ chối, xem lý do trước khi sửa và gửi lại. Muốn kiểm tra một tin cụ thể hoặc khiếu nại quyết định, hãy gửi yêu cầu hỗ trợ.',
    href: '/tin-cua-toi',
  },
  {
    id: 'people_find',
    topic: 'Kết nối',
    title: 'Tìm người ở ghép',
    questions: [
      'Tôi muốn tìm người ở ghép thì bắt đầu từ đâu?',
      'Tìm bạn cùng phòng như thế nào?',
      'Tìm bạn ở ghép ở đâu?',
    ],
    answer:
      'Hoàn thiện hồ sơ, ngân sách, khu vực mong muốn và thói quen sinh hoạt. Sau đó mở Tìm người ở ghép để xem các hồ sơ và chọn người phù hợp trước khi gửi lời mời kết nối.',
    href: '/tim-nguoi-o-ghep',
  },
  {
    id: 'connection',
    topic: 'Kết nối',
    title: 'Kết nối và nhắn tin',
    questions: [
      'Gửi lời mời kết nối như thế nào?',
      'Làm sao nhắn tin với người ở ghép?',
      'Quản lý lời mời kết nối ở đâu?',
    ],
    answer:
      'Mở hồ sơ người bạn muốn liên hệ và gửi lời mời kết nối. Theo dõi lời mời trong mục Kết nối. Khi kết nối được chấp nhận, bạn có thể dùng Tin nhắn để trao đổi; trợ lý không gửi hoặc chấp nhận lời mời thay bạn.',
    href: '/ket-noi',
  },
  {
    id: 'house',
    topic: 'Nhà chung',
    title: 'Tạo nhà và mời thành viên',
    questions: [
      'Tạo nhà chung như thế nào?',
      'Mời thành viên vào nhà chung ra sao?',
      'Tôi muốn lập nhà chung',
    ],
    answer:
      'Mở Nhà chung để tạo và quản lý nhà của bạn. Trong chi tiết nhà, người có quyền quản lý có thể mời người đã kết nối. Người được mời cần chấp nhận lời mời để tham gia; trợ lý không tự thêm thành viên hoặc thay đổi quyền trong nhà.',
    href: '/nha-chung',
  },
  {
    id: 'house_expense',
    topic: 'Nhà chung',
    title: 'Khoản chi của nhà',
    questions: [
      'Ghi khoản chi nhà chung ở đâu?',
      'Chia tiền trong nhà như thế nào?',
      'Xem công nợ nhà chung ở đâu?',
    ],
    answer:
      'Mở chi tiết nhà chung rồi vào phần Chi phí để ghi khoản chi, chọn người tham gia chia và xem số dư. Kiểm tra lại người trả tiền, số tiền và cách chia trước khi lưu. Các khoản nợ hoặc tranh chấp cụ thể cần được kiểm tra trong nhà hoặc gửi hỗ trợ.',
    href: '/nha-chung',
  },
  {
    id: 'service',
    topic: 'Hướng dẫn dịch vụ',
    title: 'Dịch vụ cho tin đăng',
    questions: [
      'Xem gói dịch vụ ở đâu?',
      'Gói ưu tiên tin bắt đầu khi nào?',
      'Mua gói dịch vụ Roomora như thế nào?',
    ],
    answer:
      'Mở Dịch vụ Roomora để xem gói và chọn tin đủ điều kiện. Quyền lợi được cấp sau khi máy chủ xác nhận thanh toán thành công; quay lại từ trang thanh toán chưa đủ để xác nhận đã trả tiền. Trợ lý không kiểm tra giao dịch hoặc cấp gói thay ADMIN.',
    href: '/dich-vu',
  },
  {
    id: 'refund',
    topic: 'Hướng dẫn dịch vụ',
    title: 'Gửi yêu cầu hoàn tiền dịch vụ',
    questions: [
      'Hướng dẫn gửi yêu cầu hoàn tiền dịch vụ',
      'Xin hoàn tiền gói dịch vụ như thế nào?',
      'Yêu cầu hoàn tiền dịch vụ ở đâu?',
    ],
    answer:
      'Mở Dịch vụ Roomora, vào Lịch sử & hoàn tiền, chọn đơn và gửi lý do trong 24 giờ từ lúc thanh toán thành công. Yêu cầu sẽ được kiểm tra trước khi xử lý; gửi yêu cầu chưa có nghĩa là đã được duyệt hoặc đã nhận tiền. Trường hợp cụ thể cần ADMIN kiểm tra.',
    href: '/dich-vu?tab=history',
  },
];

export function normalizeQuestion(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/\bpassword\b/g, 'mat khau')
    .replace(/\breset\b/g, 'dat lai')
    .replace(/\bup bai\b/g, 'dang bai')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function needsHumanReview(question: string): boolean {
  const text = normalizeQuestion(question);
  return (
    /\b(bo qua (quy tac|huong dan)|ignore|system prompt|api key|python|sql|viet code|lap trinh|thoi tiet|bitcoin|chan doan)\b/.test(
      text,
    ) ||
    /\b(bi khoa|bi hack|lua dao|tranh chap|da chuyen tien|mat tien|chua nhan tien|duyet giup|mo khoa|xu ly giup|kiem tra don|kiem tra giao dich)\b/.test(
      text,
    ) ||
    /\b(xoa|hoan tien|duyet|kiem tra)\b.*\b(cho toi|giup toi|giup minh|cua toi)\b/.test(
      text,
    ) ||
    /\b[0-9a-f]{8} [0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{4} [0-9a-f]{12}\b/.test(
      text,
    ) ||
    /\b\d{5,}\b/.test(text) ||
    question.includes('@')
  );
}

// Khi chưa có AI, chỉ nhận câu gần các cách hỏi đã biết; còn lại chuyển hỗ trợ.
export function findLocalArticle(question: string): HelpArticle | undefined {
  const text = normalizeQuestion(question);
  const exact = helpArticles.find((article) =>
    article.questions.some((value) => normalizeQuestion(value) === text),
  );
  if (exact) return exact;
  const stop = new Set([
    'toi',
    'minh',
    'ban',
    'oi',
    'cho',
    'hoi',
    'de',
    'lam',
    'the',
    'nao',
    'sao',
    'nhu',
    'o',
    'dau',
    'muon',
    'can',
    'xin',
    'hay',
    'giup',
    'huong',
    'dan',
    'voi',
    'tren',
    'roomora',
    'a',
  ]);
  const query = new Set(text.split(' ').filter((word) => !stop.has(word)));
  if (query.size < 2) return undefined;
  const ranked = helpArticles
    .map((article) => {
      const scores = article.questions.map((value) => {
        const words = new Set(
          normalizeQuestion(value)
            .split(' ')
            .filter((word) => !stop.has(word)),
        );
        const matched = [...query].filter((word) => words.has(word)).length;
        return matched / query.size >= 0.9
          ? (2 * matched) / (query.size + words.size)
          : 0;
      });
      return { article, score: Math.max(...scores) };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0].score >= 0.8 && ranked[0].score - ranked[1].score >= 0.15
    ? ranked[0].article
    : undefined;
}
