import { ApiError } from "./api";

const messages: Record<string, string> = {
  EMAIL_ALREADY_USED: "Email này đã được sử dụng.",
  INVALID_CREDENTIALS: "Email hoặc mật khẩu không đúng.",
  EMAIL_NOT_VERIFIED: "Bạn cần xác minh email trước khi đăng nhập.",
  TOKEN_INVALID: "Liên kết không hợp lệ, đã dùng hoặc đã hết hạn.",
  RATE_LIMITED: "Bạn đã thử quá nhiều lần. Vui lòng chờ rồi thử lại.",
  BUDGET_RANGE_INVALID: "Ngân sách tối thiểu không được lớn hơn tối đa.",
  AUTH_REQUIRED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  ORIGIN_NOT_ALLOWED: "Yêu cầu bị từ chối do nguồn truy cập không hợp lệ.",
};

export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code && messages[error.code]) return messages[error.code];
    if (error.kind === "network" || error.kind === "timeout")
      return error.message;
    if (error.status === 400) return "Thông tin chưa hợp lệ. Hãy kiểm tra lại.";
    if (error.status === 401) return "Bạn cần đăng nhập để tiếp tục.";
    if (error.status === 403)
      return "Bạn không có quyền thực hiện thao tác này.";
  }
  return "Có lỗi xảy ra. Vui lòng thử lại.";
}
