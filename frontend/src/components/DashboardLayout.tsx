import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import RatingNotifications from "./RatingNotifications";
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
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-auto">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-base font-semibold text-indigo-700 ring-1 ring-indigo-100"
          >
            {user.fullName.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <strong className="block break-words text-sm font-semibold text-slate-900">
              {user.fullName}
            </strong>
            <p className="m-0 mt-0.5 break-all text-xs text-slate-500">
              {user.email}
            </p>
          </div>
        </div>
        {!user.roles.some((role) => role.name === "customer") && (
          <WorkspaceSwitcher roles={user.roles} />
        )}
        {user.roles.some((role) => role.name === "vp" || role.name === "panelist") && (
          <RatingNotifications />
        )}
        <button
          type="button"
          className="button-secondary shrink-0 self-end"
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
