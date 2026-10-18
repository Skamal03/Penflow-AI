type ApiErrorBody = { error?: string; fields?: Record<string, string> };

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

let csrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const response = await fetch('/api/csrf', { credentials: 'include' });
  const body = await response.json() as { csrfToken: string };
  csrfToken = body.csrfToken;
  return csrfToken;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    headers.set('x-csrf-token', await getCsrfToken());
    if (!(init.body instanceof FormData)) headers.set('content-type', 'application/json');
  }
  const response = await fetch(`/api${path}`, { ...init, method, headers, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({})) as ApiErrorBody & T;
  if (!response.ok) throw new ApiError(body.error ?? 'The request could not be completed.', response.status, body.fields ?? {});
  return body;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, body: FormData) => request<T>(path, { method: 'POST', body }),
};
