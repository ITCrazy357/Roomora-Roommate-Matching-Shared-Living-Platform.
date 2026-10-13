import { ApiError, apiFetch } from "./api";
export interface AiUsage {
  month: string;
  used: number;
  limit: number;
  available: boolean;
}
export interface ReceiptDraft {
  title: string | null;
  amount: number | null;
  spentOn: string | null;
  category: string | null;
  warnings: string[];
}
export interface SearchDraft {
  filters: {
    type: string | null;
    provinceCode: string | null;
    minRent: number | null;
    maxRent: number | null;
    amenities: string[];
  };
  provinceName: string | null;
  unsupported: string[];
}
export interface AiInsight {
  highlights: string[];
  notice: string;
  score?: number | null;
  assessed?: number;
  total?: number;
  month?: string;
  generatedAt?: string;
}
export function aiError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Đăng nhập lại để dùng AI. Bạn vẫn có thể nhập thủ công.";
    if (error.status === 403 || error.status === 404)
      return "Bạn không có quyền đọc dữ liệu này hoặc dữ liệu không còn khả dụng.";
    if (error.code === "AI_LIMIT_REACHED")
      return "Đã hết lượt AI tháng này. Bạn vẫn có thể nhập và kiểm tra thủ công.";
    if (error.code === "AI_BUSY")
      return "AI đang xử lý yêu cầu khác. Hãy thử lại sau.";
    if (error.code === "AI_FACTS_REQUIRED")
      return "Nhập tiêu đề, giá hoặc khu vực trước khi tạo mô tả.";
    if (error.status === 400 || error.status === 413)
      return "Kiểm tra thông tin; ảnh phải là JPG, PNG hoặc WebP, tối đa 5 MB.";
  }
  return "AI chưa khả dụng hoặc chưa đọc được kết quả. Bạn vẫn có thể nhập và kiểm tra thủ công.";
}
export function aiRequest<T>(path: string, body: unknown, signal: AbortSignal) {
  return apiFetch<T>(`/ai/${path}`, {
    method: "POST",
    timeoutMs: 30000,
    signal,
    ...(body instanceof FormData
      ? { body }
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}
