const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function apiFetch(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error("Falta configurar VITE_API_BASE_URL");
  }

  const token = window.localStorage.getItem("portfolio-auth-token");

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.status === 401) {
    window.localStorage.removeItem("portfolio-auth-token");
    window.localStorage.removeItem("portfolio-auth-user");
    window.location.reload();
  }

  return response;
}
