export class ApiError extends Error {
  status: number;
  details?: unknown;
  code?: string;
  /** True when trying the same request again could plausibly succeed. */
  retryable: boolean;

  constructor(
    message: string,
    status: number,
    details?: unknown,
    code?: string,
    retryable = false,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
    this.retryable = retryable;
  }
}

const MSG = {
  offline:
    'You appear to be offline. Please check your internet connection and try again.',
  timeout:
    'This is taking longer than usual, your connection may be slow. Please try again.',
  network:
    "We couldn't reach the server. Please check your connection and try again.",
  unauthorized: 'Your session has expired. Please log in again.',
  rateLimited: 'Too many requests. Please wait a moment and try again.',
  unavailable:
    "We're having trouble reaching our servers. Please try again in a moment.",
  server: 'Something went wrong on our side. Please try again.',
  generic: 'Something went wrong. Please try again.',
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 30_000;

function fallbackMessage(status: number): string {
  if (status === 401) return MSG.unauthorized;
  if (status === 429) return MSG.rateLimited;
  if (status === 408 || status === 502 || status === 503 || status === 504)
    return MSG.unavailable;
  if (status >= 500) return MSG.server;
  return MSG.generic;
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  /** Extra automatic attempts on retryable failures. Defaults to 2 for GET, 0 otherwise. */
  retries?: number;
}

async function attempt<T>(url: string, options: RequestOptions): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError(MSG.offline, 0, undefined, 'OFFLINE', true);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      credentials: 'include',
      signal: controller.signal,
    });

    // Read the body as text first so an empty or non-JSON body
    // (e.g. an HTML error page from a proxy) can't crash us.
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      // A child whose payment is due or not verified: tell the page shell
      // (the child layout), which then shows the payment steps.
      if (
        res.status === 402 &&
        data?.code === 'PAYMENT_REQUIRED' &&
        typeof window !== 'undefined'
      ) {
        window.dispatchEvent(
          new CustomEvent('payment-required', {
            detail: { studentId: data.studentId },
          }),
        );
      }
      const serverMessage = typeof data?.error === 'string' ? data.error : null;
      throw new ApiError(
        serverMessage || fallbackMessage(res.status),
        res.status,
        data?.details,
        data?.code,
        RETRYABLE_STATUS.has(res.status),
      );
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (timedOut)
      throw new ApiError(MSG.timeout, 0, undefined, 'TIMEOUT', true);
    throw new ApiError(MSG.network, 0, undefined, 'NETWORK', true);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Session refresh
//
// The access cookie lasts 15 minutes. When a request comes back 401, the
// refresh cookie is traded for new tokens once and the request is sent again
// (safe for writes too: every route checks auth before doing anything). Only
// one refresh runs at a time across all of this browser's tabs (Web Locks),
// because each refresh token works once and a second use of the same one is
// treated as theft and ends the session.
// ---------------------------------------------------------------------------

// A 401 from these means "not signed in", not "access token expired".
const NO_REFRESH_PREFIX = '/api/auth/';

let refreshing: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  const run = (): Promise<boolean> =>
    fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((res) => res.ok)
      .catch(() => false);
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const pending = (async (): Promise<boolean> =>
    locks ? await locks.request('studyplan-auth-refresh', run) : run())();
  refreshing = pending.finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  try {
    return await requestWithRetries<T>(url, options);
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 401 &&
      !url.startsWith(NO_REFRESH_PREFIX) &&
      (await refreshSession())
    )
      return requestWithRetries<T>(url, options);
    throw err;
  }
}

async function requestWithRetries<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const isGet = !options.method || options.method.toUpperCase() === 'GET';
  // Only auto-retry GETs. Retrying a POST after a timeout could create duplicates.
  const retries = options.retries ?? (isGet ? 1 : 0);

  let lastError: ApiError | undefined;
  for (let i = 0; i <= retries; i++) {
    try {
      return await attempt<T>(url, options);
    } catch (err) {
      lastError = err as ApiError;
      const canRetry =
        lastError.retryable && lastError.code !== 'OFFLINE' && i < retries;
      if (!canRetry) throw lastError;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastError!;
}

export const api = {
  get: <T>(url: string, opts?: RequestOptions) => request<T>(url, opts),
  post: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(url, {
      ...opts,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(url, {
      ...opts,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(url: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(url, {
      ...opts,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(url: string, opts?: RequestOptions) =>
    request<T>(url, { ...opts, method: 'DELETE' }),
};

/** Convenience for catch blocks: always returns a user-safe string. */
export function getErrorMessage(err: unknown, fallback = MSG.generic): string {
  return err instanceof ApiError ? err.message : fallback;
}
