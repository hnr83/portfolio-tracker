const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function apiFetch(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error("Falta configurar VITE_API_BASE_URL");
  }

  const token = window.localStorage.getItem("portfolio-auth-token");

  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}