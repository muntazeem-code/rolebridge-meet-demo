import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import type { User } from "../types/auth";

export default function DashboardLayout({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <>
      <header className="dashboard-header">
        <div>
          <strong>{user.fullName}</strong>
          <p>{user.email}</p>
        </div>
        <WorkspaceSwitcher roles={user.roles} />
        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem("token");
            navigate("/login", { replace: true });
          }}
        >
          Sign out
        </button>
      </header>
      <main>{children}</main>
    </>
  );
}
