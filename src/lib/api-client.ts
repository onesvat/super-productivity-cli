export const DEFAULT_API_URL = "http://127.0.0.1:3876";
export const HEALTH_CHECK_TIMEOUT_MS = 2000;
export const REQUEST_TIMEOUT_MS = 10000;

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiClientError extends Error {
  code: string;
  status: number;
  
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export class ApiClientTimeout extends Error {
  constructor(message: string = "API request timed out") {
    super(message);
    this.name = "ApiClientTimeout";
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/health`,
      { method: "GET" },
      HEALTH_CHECK_TIMEOUT_MS
    );
    
    if (!response.ok) return false;
    
    const body = await response.json() as ApiResponse<{ server: string; rendererReady: boolean }>;
    return body.ok && body.data?.rendererReady === true;
  } catch {
    return false;
  }
}

export async function apiGet<T>(baseUrl: string, path: string, query?: Record<string, string | boolean | undefined>): Promise<T> {
  const url = new URL(path, baseUrl);
  
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  
  const response = await fetchWithTimeout(
    url.toString(),
    { method: "GET", headers: { "Accept": "application/json" } },
    REQUEST_TIMEOUT_MS
  );
  
  const body = await response.json() as ApiResponse<T>;
  
  if (!body.ok || body.error) {
    throw new ApiClientError(
      body.error?.message || "Unknown API error",
      body.error?.code || "UNKNOWN",
      response.status
    );
  }
  
  return body.data as T;
}

export async function apiPost<T>(baseUrl: string, path: string, body?: unknown): Promise<T> {
  const response = await fetchWithTimeout(
    new URL(path, baseUrl).toString(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    },
    REQUEST_TIMEOUT_MS
  );
  
  const respBody = await response.json() as ApiResponse<T>;
  
  if (!respBody.ok || respBody.error) {
    throw new ApiClientError(
      respBody.error?.message || "Unknown API error",
      respBody.error?.code || "UNKNOWN",
      response.status
    );
  }
  
  return respBody.data as T;
}

export async function apiPatch<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetchWithTimeout(
    new URL(path, baseUrl).toString(),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body),
    },
    REQUEST_TIMEOUT_MS
  );
  
  const respBody = await response.json() as ApiResponse<T>;
  
  if (!respBody.ok || respBody.error) {
    throw new ApiClientError(
      respBody.error?.message || "Unknown API error",
      respBody.error?.code || "UNKNOWN",
      response.status
    );
  }
  
  return respBody.data as T;
}

export async function apiDelete<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetchWithTimeout(
    new URL(path, baseUrl).toString(),
    {
      method: "DELETE",
      headers: { "Accept": "application/json" },
    },
    REQUEST_TIMEOUT_MS
  );
  
  const body = await response.json() as ApiResponse<T>;
  
  if (!body.ok || body.error) {
    throw new ApiClientError(
      body.error?.message || "Unknown API error",
      body.error?.code || "UNKNOWN",
      response.status
    );
  }
  
  return body.data as T;
}