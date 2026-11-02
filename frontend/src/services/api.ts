import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5001/api",
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const path = error.config?.url ?? "";
    const protectedRequest =
      path === "/auth/me" ||
      path.startsWith("/admin/") ||
      path.startsWith("/dashboards/") ||
      path === "/meetings" ||
      path.startsWith("/meetings/");

    if (error.response?.status === 401 && protectedRequest) {
      sessionStorage.removeItem("token");
      if (window.location.pathname !== "/login")
        window.location.replace("/login");
    }
    if (
      error.response?.data?.code === "PASSWORD_CHANGE_REQUIRED" &&
      window.location.pathname !== "/change-password"
    ) {
      window.location.replace("/change-password");
    }
    return Promise.reject(error);
  },
);

export function getApiError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data?.message === "string") return data.message;
    const fields = data?.errors?.fieldErrors;
    if (fields && typeof fields === "object") {
      const messages = Object.values(fields)
        .flat()
        .filter((value): value is string => typeof value === "string");
      if (messages.length) return messages.join(". ");
    }
    if (!error.response) return "Cannot reach the server. Please try again.";
  }
  return fallback;
}
