import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { tokenStorage } from './tokenStorage';

export class ApiException extends Error {
  code?: string;
  statusCode?: number;
  errors: { field: string; message: string }[];

  constructor(message: string, opts: { code?: string; statusCode?: number; errors?: { field: string; message: string }[] } = {}) {
    super(message);
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.errors = opts.errors ?? [];
  }
}

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const api = axios.create({ baseURL, headers: { 'Content-Type': 'application/json' } });

// Bare client for the refresh call itself, so it never recurses back
// through the response interceptor below.
const refreshClient = axios.create({ baseURL, headers: { 'Content-Type': 'application/json' } });

api.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken();
  if (token && !config.headers?.['X-Skip-Auth']) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInFlight: Promise<string | null> | null = null;

/** Broadcast so AuthContext can react (redirect to /login) without this module importing React state. */
export const sessionEvents = new EventTarget();

async function performRefresh(): Promise<string | null> {
  const refreshToken = tokenStorage.getRefreshToken();
  if (!refreshToken) return null;
  try {
    const { data } = await refreshClient.post('/auth/refresh', { refreshToken });
    const { accessToken, refreshToken: newRefreshToken } = data.data;
    tokenStorage.saveTokens(accessToken, newRefreshToken);
    return accessToken as string;
  } catch {
    tokenStorage.clear();
    sessionEvents.dispatchEvent(new Event('unauthorized'));
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ code?: string; message?: string; errors?: { field: string; message: string }[] }>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isExpired = error.response?.status === 401 && error.response.data?.code === 'TOKEN_EXPIRED';

    if (isExpired && original && !original._retried) {
      original._retried = true;
      refreshInFlight ??= performRefresh().finally(() => {
        refreshInFlight = null;
      });
      const newToken = await refreshInFlight;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api.request(original);
      }
    }

    if (!error.response) {
      throw new ApiException('No connection to the server. Please check your network.', { code: 'NETWORK_ERROR' });
    }
    throw new ApiException(error.response.data?.message ?? 'Something went wrong', {
      code: error.response.data?.code,
      statusCode: error.response.status,
      errors: error.response.data?.errors ?? [],
    });
  },
);

/** Unwraps the backend's `{ success, data }` envelope. */
export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get(url, { params });
  return data.data as T;
}

/** Same as apiGet but returns the full envelope, for endpoints exposing `meta` (pagination). */
export async function apiGetPage<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<{ items: T[]; page: number; totalPages: number; total: number }> {
  const { data } = await api.get(url, { params });
  return {
    items: (data.data ?? []) as T[],
    page: data.meta?.page ?? 1,
    totalPages: data.meta?.totalPages ?? 1,
    total: data.meta?.total ?? (data.data?.length ?? 0),
  };
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.post(url, body);
  return data.data as T;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.patch(url, body);
  return data.data as T;
}

export async function apiDelete<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.delete(url, { data: body });
  return data.data as T;
}
