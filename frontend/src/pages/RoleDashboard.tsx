import { useEffect, useState } from "react";
import { api, getApiError } from "../services/api";
import type { MessageResponse, RoleName } from "../types/auth";
import CompanySubmissions from "../components/CompanySubmissions";

export default function RoleDashboard({
  role,
  title,
}: {
  role: Exclude<RoleName, "super_admin">;
  title: string;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .get<MessageResponse>(`/dashboards/${role}`)
      .then(({ data }) => {
        if (active) setMessage(data.message);
      })
      .catch((error: unknown) => {
        if (active) setError(getApiError(error, "Unable to load dashboard."));
      });
    return () => {
      active = false;
    };
  }, [role]);
  return (
    <>
    <section>
      <h1>{title} dashboard</h1>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <p role="status">{message || "Loading dashboard..."}</p>
      )}
    </section>
    {role === "reviewer" && <CompanySubmissions scope="reviewer" />}
    </>
  );
}
