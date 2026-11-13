import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
  useOutletContext,
} from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";

import Home from "./pages/Home";
import ApplyProgram from "./pages/ApplyProgram";
import Login from "./pages/Login";
import AcceptInvite from "./pages/AcceptInvite";
import ChangePassword from "./pages/ChangePassword";
import SuperAdmin from "./pages/SuperAdmin";
import VPDashboard from "./pages/VPDashboard";
import PanelistDashboard from "./pages/PanelistDashboard";
import CustomerDashboard from "./pages/CustomerDashboard";
import RoleDashboard from "./pages/RoleDashboard";

import { getDashboardPath } from "./services/auth";
import type { User } from "./types/auth";

function DashboardRedirect() {
  const user = useOutletContext<User>();
  return <Navigate to={getDashboardPath(user)} replace />;
}

function RootRoute() {
  const token = sessionStorage.getItem("token");
  if (token) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Home />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/apply" element={<ApplyProgram />} />
        <Route path="/login" element={<Login />} />
        <Route path="/set-password" element={<AcceptInvite />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />

        <Route element={<ProtectedRoute key="password" allowPasswordChange />}>
          <Route path="/change-password" element={<ChangePassword />} />
        </Route>
        <Route
          element={
            <ProtectedRoute key="super_admin" allowedRoles={["super_admin"]} />
          }
        >
          <Route path="/dashboard/super-admin" element={<SuperAdmin />} />
          <Route
            path="/admin"
            element={<Navigate to="/dashboard/super-admin" replace />}
          />
        </Route>
        <Route element={<ProtectedRoute key="vp" allowedRoles={["vp"]} />}>
          <Route path="/dashboard/vp" element={<VPDashboard />} />
        </Route>
        <Route
          element={
            <ProtectedRoute key="panelist" allowedRoles={["panelist"]} />
          }
        >
          <Route path="/dashboard/panelist" element={<PanelistDashboard />} />
        </Route>
        <Route
          element={
            <ProtectedRoute key="reviewer" allowedRoles={["reviewer"]} />
          }
        >
          <Route
            path="/dashboard/reviewer"
            element={<RoleDashboard role="reviewer" title="Reviewer" />}
          />
        </Route>
        <Route
          element={
            <ProtectedRoute key="customer" allowedRoles={["customer"]} />
          }
        >
          <Route path="/dashboard/customer" element={<CustomerDashboard />} />
        </Route>
        <Route element={<ProtectedRoute key="default" />}>
          <Route path="/dashboard" element={<DashboardRedirect />} />
          <Route
            path="/unauthorized"
            element={
              <section>
                <h1>Access denied</h1>
                <p>Select one of your assigned workspaces above.</p>
              </section>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
