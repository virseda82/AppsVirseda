const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:10000";

export function setToken(token) {
  localStorage.setItem("token", token);
}
export function getToken() {
  return localStorage.getItem("token");
}
export function clearToken() {
  localStorage.removeItem("token");
}

export function getTokenPayload() {
  const token = getToken();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

export const api = {
  register: (payload) => request("/auth/register", { method: "POST", body: payload }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload }),
  listFamilies: () => request("/families"),
  createFamily: (payload) => request("/families", { method: "POST", body: payload }),
  listEvents: (familyId, from, to) =>
    request(`/families/${familyId}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  createEvent: (familyId, payload) =>
    request(`/families/${familyId}/events`, { method: "POST", body: payload }),
  updateEvent: (id, payload) => request(`/events/${id}`, { method: "PUT", body: payload }),
  deleteEvent: (id) => request(`/events/${id}`, { method: "DELETE" }),
  adminResetEvents: () => request("/admin/reset-events", { method: "POST" }),
};
