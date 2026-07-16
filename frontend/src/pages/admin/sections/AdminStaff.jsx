// frontend/src/pages/admin/sections/AdminStaff.jsx — NOUVEAU fichier.
// Gestion des membres de l'équipe (rôle "staff") et de leurs permissions
// par zone. Réservé aux "admin" (owner) — la route parente dans
// AdminLayout.jsx bloque déjà l'accès à un staff, ceci est la vue elle-même.
import { useEffect, useState } from "react";
import { Plus, Trash2, Mail, ShieldCheck, X, Save, Clock } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";

const AREAS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "orders", label: "Orders" },
  { key: "products", label: "Products" },
  { key: "coupons", label: "Coupons" },
  { key: "customers", label: "Customers" },
  { key: "subscribers", label: "Subscribers" },
  { key: "shipping", label: "Shipping" },
];

const BLANK_PERMISSIONS = Object.fromEntries(AREAS.map((a) => [a.key, "none"]));

export default function AdminStaff() {
  const [staff, setStaff] = useState([]);
  const [invites, setInvites] = useState([]);
  const [inviting, setInviting] = useState(null); // null | { email, name, permissions }
  const [editingPerms, setEditingPerms] = useState(null); // user being edited
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get("/admin/staff").then((r) => setStaff(r.data)).catch(() => {});
    api.get("/admin/staff/invites").then((r) => setInvites(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const sendInvite = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/staff/invite", inviting);
      toast.success(`Invitation sent to ${inviting.email}`);
      setInviting(null);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelInvite = async (id) => {
    await api.delete(`/admin/staff/invites/${id}`);
    load();
  };

  const savePermissions = async () => {
    setBusy(true);
    try {
      await api.put(`/admin/staff/${editingPerms.id}/permissions`, editingPerms.permissions);
      toast.success("Permissions updated");
      setEditingPerms(null);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (user) => {
    if (!window.confirm(`Revoke admin access for ${user.name || user.email}? Their account becomes a normal customer account.`)) return;
    try {
      await api.delete(`/admin/staff/${user.id}`);
      toast.success("Access revoked");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  const promote = async (user) => {
    if (!window.confirm(`Make ${user.name || user.email} an owner? They will have full access, including managing other team members. This cannot be undone from here.`)) return;
    try {
      await api.post(`/admin/staff/${user.id}/promote`);
      toast.success(`${user.name || user.email} is now an owner`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  return (
    <div className="p-8" data-testid="admin-staff">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// TEAM</div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight mt-2">Team access</h1>
          <p className="font-mono text-xs text-foreground/60 mt-1">{staff.length} members · {invites.length} pending</p>
        </div>
        <button
          onClick={() => setInviting({ email: "", name: "", as_owner: false, permissions: { ...BLANK_PERMISSIONS } })}
          data-testid="new-staff-btn"
          className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-foreground/80"
        >
          <Plus size={14} /> Invite member
        </button>
      </div>

      {/* Invite form */}
      {inviting && (
        <form onSubmit={sendInvite} className="bg-white border border-ink/10 p-6 mb-8" data-testid="staff-invite-form">
          <div className="grid sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 mb-1">Name</label>
              <input required value={inviting.name} onChange={(e) => setInviting({ ...inviting, name: e.target.value })}
                data-testid="staff-invite-name"
                className="w-full border-b border-ink px-1 py-2.5 bg-transparent focus:outline-none focus:border-signal" />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 mb-1">Email</label>
              <input required type="email" value={inviting.email} onChange={(e) => setInviting({ ...inviting, email: e.target.value })}
                data-testid="staff-invite-email"
                className="w-full border-b border-ink px-1 py-2.5 bg-transparent focus:outline-none focus:border-signal" />
            </div>
          </div>
          <label className="flex items-center gap-2 mb-5 font-mono text-xs uppercase tracking-[0.15em]">
            <input type="checkbox" checked={inviting.as_owner}
              onChange={(e) => setInviting({ ...inviting, as_owner: e.target.checked })}
              data-testid="staff-invite-as-owner" />
            Make this person an owner (full access, can manage other members)
          </label>
          {!inviting.as_owner && (
            <PermissionGrid
              permissions={inviting.permissions}
              onChange={(p) => setInviting({ ...inviting, permissions: p })}
              testPrefix="invite"
            />
          )}
          <div className="flex gap-3 mt-5">
            <button type="submit" disabled={busy} data-testid="staff-invite-submit"
              className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-50">
              {busy ? "…" : "Send invitation"}
            </button>
            <button type="button" onClick={() => setInviting(null)}
              className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-6 py-3">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Edit permissions modal-like inline panel */}
      {editingPerms && (
        <div className="bg-white border border-signal p-6 mb-8" data-testid="staff-edit-permissions">
          <div className="flex items-center justify-between mb-5">
            <div className="font-mono text-xs uppercase tracking-[0.2em]">
              Editing access for <span className="font-bold">{editingPerms.name || editingPerms.email}</span>
            </div>
            <button onClick={() => setEditingPerms(null)}><X size={16} /></button>
          </div>
          <PermissionGrid
            permissions={editingPerms.permissions}
            onChange={(p) => setEditingPerms({ ...editingPerms, permissions: p })}
            testPrefix="edit"
          />
          <div className="flex gap-3 mt-5">
            <button onClick={savePermissions} disabled={busy} data-testid="staff-permissions-save"
              className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-50">
              {busy ? "…" : "Save changes"}
            </button>
            <p className="font-mono text-[10px] text-foreground/50 self-center">
              Takes effect immediately — their other sessions are also refreshed.
            </p>
          </div>
        </div>
      )}

      {/* Active members */}
      <div className="bg-white border border-ink/10 overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-foreground/70">
            <tr>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Name</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Email</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Role</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Access</th>
              <th className="px-6 py-3 text-right font-mono text-[10px] uppercase tracking-[0.2em]"></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t border-ink/5" data-testid={`staff-row-${s.email}`}>
                <td className="px-6 py-3 font-bold">{s.name}</td>
                <td className="px-6 py-3 font-mono text-xs">{s.email}</td>
                <td className="px-6 py-3">
                  {s.role === "admin" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-ink text-white text-[10px] font-mono uppercase tracking-[0.15em]">
                      <ShieldCheck size={11} /> Owner
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 bg-secondary text-[10px] font-mono uppercase tracking-[0.15em]">
                      Staff
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 font-mono text-[11px] text-foreground/70">
                  {s.role === "admin"
                    ? "Full access"
                    : AREAS.filter((a) => (s.permissions?.[a.key] || "none") !== "none")
                        .map((a) => `${a.label} (${s.permissions[a.key]})`)
                        .join(", ") || "No access granted"}
                </td>
                <td className="px-6 py-3 text-right">
                  {s.role !== "admin" && (
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setEditingPerms(s)} data-testid={`staff-edit-${s.email}`}
                        className="font-mono text-[10px] uppercase tracking-[0.15em] link-underline">
                        Edit
                      </button>
                      <button onClick={() => promote(s)} data-testid={`staff-promote-${s.email}`}
                        className="font-mono text-[10px] uppercase tracking-[0.15em] link-underline">
                        Make owner
                      </button>
                      <button onClick={() => revoke(s)} data-testid={`staff-revoke-${s.email}`}
                        className="font-mono text-[10px] uppercase tracking-[0.15em] text-signal link-underline">
                        Revoke
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/50 mb-3">Pending invites</div>
          <div className="bg-white border border-ink/10 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-foreground/70">
                <tr>
                  <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Name</th>
                  <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Email</th>
                  <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Sent</th>
                  <th className="px-6 py-3 text-right font-mono text-[10px] uppercase tracking-[0.2em]"></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="border-t border-ink/5" data-testid={`invite-row-${inv.email}`}>
                    <td className="px-6 py-3">{inv.name}</td>
                    <td className="px-6 py-3 font-mono text-xs flex items-center gap-2">
                      <Mail size={12} className="text-foreground/40" /> {inv.email}
                    </td>
                    <td className="px-6 py-3 font-mono text-[11px] text-foreground/60 flex items-center gap-1">
                      <Clock size={11} /> {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button onClick={() => cancelInvite(inv.id)} data-testid={`invite-cancel-${inv.email}`}
                        className="font-mono text-[10px] uppercase tracking-[0.15em] text-signal link-underline">
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function PermissionGrid({ permissions, onChange, testPrefix }) {
  const set = (area, level) => onChange({ ...permissions, [area]: level });
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 mb-3">
        Access by section
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        {AREAS.map((a) => (
          <div key={a.key} className="flex items-center justify-between border border-ink/10 px-4 py-2.5">
            <span className="text-sm">{a.label}</span>
            <select
              value={permissions[a.key] || "none"}
              onChange={(e) => set(a.key, e.target.value)}
              data-testid={`${testPrefix}-perm-${a.key}`}
              className="font-mono text-[11px] uppercase tracking-[0.1em] border border-ink/20 px-2 py-1 bg-transparent focus:outline-none"
            >
              <option value="none">No access</option>
              <option value="view">View only</option>
              <option value="manage">Full (view + edit)</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
