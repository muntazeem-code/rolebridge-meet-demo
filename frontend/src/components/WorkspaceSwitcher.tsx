import { useNavigate, useLocation } from "react-router-dom";
import type { Role } from "../types/auth";

export default function WorkspaceSwitcher({ roles }: { roles: Role[] }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active =
    roles.find((role) => pathname === role.dashboardPath)?.dashboardPath ?? "";

  return (
    <label className="min-w-0 flex-1 text-xs text-slate-500 sm:w-56 sm:flex-none">
      My workspaces
      <select value={active} onChange={(event) => navigate(event.target.value)}>
        <option value="" disabled>
          Select workspace
        </option>
        {roles.map((role) => (
          <option key={role.name} value={role.dashboardPath}>
            {role.label}
          </option>
        ))}
      </select>
    </label>
  );
}
