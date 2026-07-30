import type { ApiResponse } from '@job-program/shared';

export interface ImportSummary {
  created: number;
  updated: number;
  errors: Array<{ row: number; message: string }>;
}

const apiBaseUrl = window.api?.apiBaseUrl ?? 'http://localhost:3000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    // 응답 본문이 없는 경우 (예: 204)
  }

  if (!res.ok || !json?.success) {
    throw new Error(json?.message ?? `요청에 실패했습니다. (${res.status})`);
  }

  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', headers: {}, body: form }),
};

/** 엑셀 등 바이너리 파일을 다운로드해서 브라우저에 저장한다. */
export async function downloadFile(path: string, fileName: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl}${path}`);
  if (!res.ok) {
    throw new Error(`다운로드에 실패했습니다. (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
