const BACKEND_PORT = 4000;

function getApiUrl(): string {
  if (typeof window === 'undefined') {
    // SSR fallback (should not be used since we use browser-direct calls)
    return `http://localhost:${BACKEND_PORT}`;
  }
  return `http://${window.location.hostname}:${BACKEND_PORT}`;
}

const BASE = getApiUrl();

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    if (res.status === 401) {
      // Redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Auth
export function login(password: string) {
  return request<{ success: boolean }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function logout() {
  return request<{ success: boolean }>('/auth/logout', {
    method: 'POST',
  });
}

export function checkAuth() {
  return request<{ authenticated: boolean }>('/auth/me');
}

// Feeds
export function getFeeds() {
  return request<import('./types').Feed[]>('/feeds');
}

export function addFeed(url: string, title?: string) {
  return request<import('./types').Feed>('/feeds', {
    method: 'POST',
    body: JSON.stringify({ url, title }),
  });
}

export function deleteFeed(id: number) {
  return request<{ success: boolean }>(`/feeds/${id}`, {
    method: 'DELETE',
  });
}

// Editions
export function getEditions() {
  return request<import('./types').Edition[]>('/editions');
}

export function getEdition(id: number) {
  return request<import('./types').Edition>(`/editions/${id}`);
}

// Articles
export function updateArticlePosition(id: number, position: number) {
  return request<{ id: number; position: number }>(`/articles/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ position }),
  });
}

// Admin
export function triggerRunTick() {
  return request<{ editionId?: number; articleCount?: number; skipped?: boolean }>('/admin/run-tick', {
    method: 'POST',
  });
}
