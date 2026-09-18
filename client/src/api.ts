import type { SessionInfo } from "../../shared/types";
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
let csrf = "";
export function setSession(session: SessionInfo | null) {
  csrf = session?.csrfToken || "";
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(csrf ? { "x-csrf-token": csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && path !== "/login" && csrf)
        window.dispatchEvent(new Event("session-expired"));
      throw new ApiError(data.message || "请求失败", response.status);
    }
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("网络连接未完成，草稿已保留。请检查网络后重试。", 0);
  } finally {
    clearTimeout(timeout);
  }
}
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "操作未完成，请重试";
