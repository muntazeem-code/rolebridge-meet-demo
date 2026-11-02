import type { AuthResponse, User } from "../types/auth";

export function getDashboardPath(user: User): string {
  if (user.mustChangePassword) return "/change-password";
  return (
    user.roles.find((role) => role.dashboardPath)?.dashboardPath ??
    "/unauthorized"
  );
}

export function saveSession(data: AuthResponse): void {
  if (
    !data.success ||
    !data.token ||
    !data.user ||
    !Array.isArray(data.user.roles)
  ) {
    throw new Error("Invalid authentication response");
  }
  sessionStorage.setItem("token", data.token);
}
