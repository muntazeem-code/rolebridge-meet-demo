import { useEffect, useState } from "react";
import { api, getApiError } from "../services/api";
import type { CustomerAssignment, CustomerOption } from "../types/meeting";

export default function CustomerAssignments({
  refreshKey = 0,
}: {
  refreshKey?: number;
}) {
  const [customers, setCustomers] = useState<CustomerAssignment[]>([]);
  const [vps, setVps] = useState<CustomerOption[]>([]);
  const [editing, setEditing] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .get<{
        data: { customers: CustomerAssignment[]; vps: CustomerOption[] };
      }>("/admin/customer-access")
      .then(({ data }) => {
        if (active) {
          setCustomers(data.data.customers);
          setVps(data.data.vps);
          setError("");
        }
      })
      .catch((error: unknown) => {
        if (active)
          setError(getApiError(error, "Unable to load customer assignments."));
      });
    return () => {
      active = false;
    };
  }, [reload, refreshKey]);
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.patch(`/admin/customer-access/${editing}`, { vpIds: selected });
      setCustomers((previous) =>
        previous.map((customer) =>
          customer._id === editing
            ? { ...customer, vpIds: selected }
            : customer,
        ),
      );
      setEditing("");
      setMessage("Customer assignment saved.");
    } catch (error) {
      setError(getApiError(error, "Unable to save assignment."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="section-heading">
        <h2>Customer access for VPs</h2>
        <button
          type="button"
          disabled={busy || !!editing}
          onClick={() => setReload((value) => value + 1)}
        >
          Refresh assignments
        </button>
      </div>
      <p>
        Assigned VPs can view the customer's company form and reviewer feedback,
        and schedule meetings with an active customer.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Assigned VPs</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer._id}>
                <td>
                  {customer.fullName}
                  <small>{customer.email}</small>
                </td>
                <td>
                  {customer.vpIds
                    .map(
                      (id) =>
                        vps.find((vp) => vp._id === id)?.fullName ??
                        "Unavailable VP",
                    )
                    .join(", ") || "None"}
                </td>
                <td>
                  <button
                    type="button"
                    disabled={busy || !!editing}
                    onClick={() => {
                      setEditing(customer._id);
                      setSelected(
                        customer.vpIds.filter((id) =>
                          vps.some((vp) => vp._id === id),
                        ),
                      );
                      setMessage("");
                      setError("");
                    }}
                  >
                    Assign VPs
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!customers.length && !error && <p>No active customer accounts found.</p>}
      {editing && (
        <div className="assignment-editor">
          <h3>
            VPs for{" "}
            {customers.find((customer) => customer._id === editing)?.fullName}
          </h3>
          <fieldset disabled={busy}>
            <legend>Select VPs (clear all to revoke access)</legend>
            {vps.map((vp) => (
              <label className="choice" key={vp._id}>
                <input
                  type="checkbox"
                  checked={selected.includes(vp._id)}
                  onChange={() =>
                    setSelected((previous) =>
                      previous.includes(vp._id)
                        ? previous.filter((id) => id !== vp._id)
                        : [...previous, vp._id],
                    )
                  }
                />
                {vp.fullName} ({vp.email})
              </label>
            ))}
          </fieldset>
          {!vps.length && <p>No active VP accounts found.</p>}
          <div className="user-actions">
            <button type="button" disabled={busy} onClick={save}>
              {busy ? "Saving..." : "Save Assignment"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing("")}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
