export class ApiError extends Error {
  readonly kind: "http" | "network" | "timeout" | "response" | "config";
  readonly status?: number;
  readonly code?: string;

  constructor(
    message: string,
    kind: ApiError["kind"],
    status?: number,
    code?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

type ApiOptions = RequestInit & { timeoutMs?: number };

/** JSON API requests. Error response bodies are never displayed to the user. */
export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) throw new ApiError("Chưa cấu hình địa chỉ API.", "config");
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new ApiError("Đường dẫn API không hợp lệ.", "config");
  }

  const { timeoutMs = 8000, signal, ...init } = options;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const headers = new Headers(init.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers,
      credentials: init.credentials ?? "include",
      signal: controller.signal,
    });
    if (!response.ok) {
      let code: string | undefined;
      try {
        const body = (await response.json()) as { code?: unknown };
        if (typeof body.code === "string") code = body.code;
      } catch {
        // Error bodies are optional. Never show raw server content to users.
      }
      throw new ApiError(
        `Yêu cầu không thành công (HTTP ${response.status}).`,
        "http",
        response.status,
        code,
      );
    }
    if (response.status === 204) return undefined as T;
    try {
      return (await response.json()) as T;
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new ApiError("Phản hồi từ máy chủ không hợp lệ.", "response");
    }
  } catch (error) {
    if (timedOut)
      throw new ApiError(
        "Máy chủ phản hồi quá lâu. Vui lòng thử lại.",
        "timeout",
      );
    if (signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "Không thể kết nối máy chủ. Kiểm tra kết nối và thử lại.",
      "network",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
