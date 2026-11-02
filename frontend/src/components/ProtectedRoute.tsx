import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { api, getApiError } from "../services/api";
import type { CurrentUserResponse, RoleName, User } from "../types/auth";
import DashboardLayout from "./DashboardLayout";

interface Props {
  allowedRoles?: RoleName[];
  allowPasswordChange?: boolean;
}

export default function ProtectedRoute({
  allowedRoles,
  allowPasswordChange = false,
}: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!sessionStorage.getItem("token")) return;
    api
      .get<CurrentUserResponse>("/auth/me")
      .then(({ data }) => {
        if (active) setUser(data.user);
      })
      .catch((error: unknown) => {
        if (active)
          setError(getApiError(error, "Unable to check your account."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!sessionStorage.getItem("token")) return <Navigate to="/login" replace />;
  if (loading) return <p role="status">Checking access...</p>;
  if (error)
    return (
      <main>
        <p role="alert">{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </main>
    );
  if (!user || user.status !== "active")
    return <Navigate to="/login" replace />;
  if (user.mustChangePassword && !allowPasswordChange) {
    return <Navigate to="/change-password" replace />;
  }
  if (
    allowedRoles &&
    !user.roles.some((role) => allowedRoles.includes(role.name))
  ) {
    return <Navigate to="/unauthorized" replace />;
  }

  const outlet = <Outlet context={user} />;
  return allowPasswordChange ? (
    outlet
  ) : (
    <DashboardLayout user={user}>{outlet}</DashboardLayout>
  );
}
