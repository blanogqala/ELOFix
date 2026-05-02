import axios from 'axios';
import { STORAGE_KEYS } from '@/lib/api/storage';

const BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  'http://localhost:5000/api';
const AUTH_PATHS = new Set(['/login', '/register']);

class ApiHttpError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.data = data;
  }
}

function getStoredToken() {
  if (typeof window === 'undefined') return null;

  const rawSession = localStorage.getItem(STORAGE_KEYS.AUTH);
  if (!rawSession) return null;

  try {
    const parsed = JSON.parse(rawSession);
    return parsed?.token ?? null;
  } catch {
    return null;
  }
}

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = Number(error?.response?.status || 0);
    const responseData = error?.response?.data;
    const serverMsg = error?.response?.data?.message;
    const message =
      status === 401
        ? 'Session expired. Please log in again.'
        : status === 403
          ? serverMsg || 'Not authorized'
          : status >= 500
            ? 'Something went wrong'
            : error?.response?.data?.error?.message ||
              error?.response?.data?.error ||
              error?.response?.data?.message ||
              error?.message ||
              'Request failed';

    if (status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.AUTH);
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      const path = window.location.pathname || '/';
      if (!AUTH_PATHS.has(path)) {
        const next = path + (window.location.search || '');
        const loginUrl = `/login?next=${encodeURIComponent(next)}`;
        window.location.assign(loginUrl);
      }
    }

    return Promise.reject(new ApiHttpError(String(message), status, responseData));
  }
);

export { ApiHttpError };
export default apiClient;
