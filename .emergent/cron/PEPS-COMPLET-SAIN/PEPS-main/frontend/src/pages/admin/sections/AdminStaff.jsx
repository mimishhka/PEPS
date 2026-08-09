// frontend/src/pages/admin/sections/AdminStaff.jsx — NOUVEAU fichier.
// Gestion des membres de l'équipe (rôle "staff") et de leurs permissions
// par zone. Réservé aux "admin" (owner) — la route parente dans
// AdminLayout.jsx bloque déjà l'accès à un staff, ceci est la vue elle-même.
import { useEffect, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { Plus, Trash2, Mail, ShieldCheck, X, Save, Clock } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";
import { useConfirm } from "../../../components/ConfirmDialog";

const AREAS = [
  { key: "dashboard", fr: "Tableau de bord", en: "Dashboard" },
  { key: "orders", fr: "Commandes", en: "Orders" },
  { key: "products", fr: "Produits", en: "Products" },
  { key: "categories", fr: "Catégories", en: "Categories" },
  { key: "menus", fr: "Menus", en: "Menus" },
  { key: "coupons", fr: "Coupons", en: "Coupons" },
  { key: "customers", fr: "Clients", en: "Customers" },
  { key: "subscribers", fr: "Abonnés", en: "Subscribers" },
  { key: "shipping", fr: "Expédition", en: "Shipping" },
  { key: "affiliates", fr: "Affiliés", en: "Affiliates" },
  { key: "seo", fr: "SEO", en: "SEO" },
  { key: "emails", fr: "Emails", en: "Emails" },
  // Sections sensibles : sans accès par défaut, signalées dans l'UI.
  { key: "staff", fr: "Équipe", en: "Team", sensitive: true },
  { key: "audit", fr: "Journal d'audit", en: "Audit log", sensitive: true },
  { key: "trash", fr: "Corbeille", en: "Trash", sensitive: true },
];

// Tout à "none" par défaut → un nouvel invité n'a AUCUN accès tant que
// le propriétaire n'accorde rien. Les sections sensibles restent donc
// naturellement sans accès à l'invitation.
const BLANK_PERMISSIONS = Object.fromEntries(AREAS.map((a) => [a.key, "none"]));

export default function AdminStaff() {
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const isOwner = me?.role === "admin";
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
    const ok = await confirm({
      title: `Revoke admin access for ${user.name || user.email}?`,
      description: "Their account becomes a normal customer account.",
      confirmLabel: "Revoke",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/staff/${user.id}`);
      toast.success("Access revoked");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  const promote = async (user) => {
    const ok = await confirm({
      title: `Make ${user.name || user.email} an owner?`,
      description: "They will have full access, including managing other team members. This cannot be undone from here.",
      confirmLabel: "Make owner",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
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
          <div className="font-data text-[11px] uppercase tracking-[0.3em] text-glacier">// TEAM</div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight mt-2">Team access</h1>
          <p className="font-data text-xs text-glacier mt-1">{staff.length} members · {invites.length} pending</p>
        </div>
        <button
          onClick={() => setInviting({ email: "", name: "", as_owner: false, permissions: { ...BLANK_PERMISSIONS } })}
          data-testid="new-staff-btn"
          className="bg-nordfjord text-white font-data text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-foreground/80"
        >
          <Plus size={14} /> Invite member
        </button>
      </div>

      {/* Invite form */}
      {inviting && (
        <form onSubmit={sendInvite} className="bg-white border border-ash p-6 mb-8" data-testid="staff-invite-form">
          <div className="grid sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-glacier mb-1">Name</label>
              <input required value={inviting.name} onChange={(e) => setInviting({ ...inviting, name: e.target.value })}
                data-testid="staff-invite-name"
                className="w-full border-b border-nordfjord px-1 py-2.5 bg-transparent focus:outline-none focus:border-nova" />
            </div>
            <div>
              <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-glacier mb-1">Email</label>
              <input required type="email" value={inviting.email} onChange={(e) => setInviting({ ...inviting, email: e.target.value })}
                data-testid="staff-invite-email"
                className="w-full border-b border-nordfjord px-1 py-2.5 bg-transparent focus:outline-none focus:border-nova" />
            </div>
          </div>
          {isOwner && (
            <label className="flex items-center gap-2 mb-5 font-data text-xs uppercase tracking-[0.15em]">
              <input type="checkbox" checked={inviting.as_owner}
                onChange={(e) => setInviting({ ...inviting, as_owner: e.target.checked })}
                data-testid="staff-invite-as-owner" />
              Make this person an owner (full access, can manage other members)
            </label>
          )}
          {!inviting.as_owner && (
            <PermissionGrid
              permissions={inviting.permissions}
              onChange={(p) => setInviting({ ...inviting, permissions: p })}
              testPrefix="invite"
              canGrantSensitive={isOwner}
            />
          )}
          <div className="flex gap-3 mt-5">
            <button type="submit" disabled={busy} data-testid="staff-invite-submit"
              className="bg-nordfjord text-white font-data text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-50">
              {busy ? "…" : "Send invitation"}
            </button>
            <button type="button" onClick={() => setInviting(null)}
              className="border border-nordfjord font-data text-xs uppercase tracking-[0.25em] px-6 py-3">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Edit permissions modal-like inline panel */}
      {editingPerms && (
        <div className="bg-white border border-nova p-6 mb-8" data-testid="staff-edit-permissions">
          <div className="flex items-center justify-between mb-5">
            <div className="font-data text-xs uppercase tracking-[0.2em]">
              Editing access for <span className="font-bold">{editingPerms.name || editingPerms.email}</span>
            </div>
            <button onClick={() => setEditingPerms(null)}><X size={16} /></button>
          </div>
          <PermissionGrid
            permissions={editingPerms.permissions}
            onChange={(p) => setEditingPerms({ ...editingPerms, permissions: p })}
            testPrefix="edit"
            canGrantSensitive={isOwner}
          />
          <div className="flex gap-3 mt-5">
            <button onClick={savePermissions} disabled={busy} data-testid="staff-permissions-save"
              className="bg-nordfjord text-white font-data text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-50">
              {busy ? "…" : "Save changes"}
            </button>
            <p className="font-data text-[10px] text-glacier self-center">
              Takes effect immediately — their other sessions are also refreshed.
            </p>
          </div>
        </div>
      )}

      {/* Active members */}
      <div className="bg-white border border-ash overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead className="bg-clinical text-glacier">
            <tr>
              <th className="px-6 py-3 text-left font-data text-[10px] uppercase tracking-[0.2em]">Name</th>
              <th className="px-6 py-3 text-left font-data text-[10px] uppercase tracking-[0.2em]">Email</th>
              <th className="px-6 py-3 text-left font-data text-[10px] uppercase tracking-[0.2em]">Role</th>
              <th className="px-6 py-3 text-left font-data text-[10px] uppercase tracking-[0.2em]">Access</th>
              <th className="px-6 py-3 text-right font-data text-[10px] uppercase tracking-[0.2em]"></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t border-ash/50" data-testid={`staff-row-${s.email}`}>
                <td className="px-6 py-3 font-bold">{s.name}</td>
                <td className="px-6 py-3 font-data text-xs">{s.email}</td>
                <td className="px-6 py-3">
                  {s.role === "admin" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-nordfjord text-white text-[10px] font-data uppercase tracking-[0.15em]">
                      <ShieldCheck size={11} /> Owner
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 bg-clinical text-[10px] font-data uppercase tracking-[0.15em]">
                      Staff
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 font-data text-[11px] text-glacier">
                  {s.role === "admin"
                    ? "Full access"
                    : AREAS.filter((a) => (s.permissions?.[a.key] || "none") !== "none")
                        .map((a) => `${a.key} (${s.permissions[a.key]})`)
                        .join(", ") || "No access granted"}
                </td>
                <td className="px-6 py-3 text-right">
                  {s.role !== "admin" && (
                    <div className="flex justify-end gap-3">
                      <button onClick={() => setEditingPerms(s)} data-testid={`staff-edit-${s.email}`}
                        className="font-data text-[10px] uppercase tracking-[0.15em] link-underline">
                        Edit
                      </button>
                      {isOwner && (
                        <>
                          <button onClick={() => promote(s)} data-testid={`staff-promote-${s.email}`}
                            className="font-data text-[10px] uppercase tracking-[0.15em] link-underline">
                            Make owner
                          </button>
                          <button onClick={() => revoke(s)} data-testid={`staff-revoke-${s.email}`}
                            className="font-data text-[10px] uppercase tracking-[0.15em] text-nova link-underline">
                            Revoke
                          </button>
                        </>
                      )}
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
          <div className="font-data text-[11px] uppercase tracking-[0.25em] text-glacier mb-3">Pending invites</div>
          <div className="bg-white border border-ash overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-clinical text-glacier">
                <tr>
                  <th className="px-6 py-3 text-left font-data text-[10px] uppercase tracking-[0.2em]">Name</th>
                  <th className="px-6 py-3 text-left font-data text-[10px] uppercase tracking-[0.2em]">Email</th>
                  <th className="px-6 py-3 text-left font-data text-[10px] uppercase tracking-[0.2em]">Sent</th>
                  <th className="px-6 py-3 text-right font-data text-[10px] uppercase tracking-[0.2em]"></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="border-t border-ash/50" data-testid={`invite-row-${inv.email}`}>
                    <td className="px-6 py-3">{inv.name}</td>
                    <td className="px-6 py-3 font-data text-xs flex items-center gap-2">
                      <Mail size={12} className="text-glacier/70" /> {inv.email}
                    </td>
                    <td className="px-6 py-3 font-data text-[11px] text-glacier flex items-center gap-1">
                      <Clock size={11} /> {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button onClick={() => cancelInvite(inv.id)} data-testid={`invite-cancel-${inv.email}`}
                        className="font-data text-[10px] uppercase tracking-[0.15em] text-nova link-underline">
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

function PermissionGrid({ permissions, onChange, testPrefix, canGrantSensitive = true }) {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const set = (area, level) => onChange({ ...permissions, [area]: level });
  return (
    <div>
      <label className="block font-data text-[10px] uppercase tracking-[0.2em] text-glacier mb-3">
        {L("Accès par section", "Access by section")}
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        {AREAS.map((a) => {
          const locked = a.sensitive && !canGrantSensitive;
          return (
          <div key={a.key}
            className={`flex items-center justify-between border px-4 py-2.5 rounded-lg ${
              a.sensitive ? "border-warning/40 bg-warning/10" : "border-ash"} ${locked ? "opacity-50" : ""}`}>
            <span className="text-sm flex items-center gap-1.5">
              {L(a.fr, a.en)}
              {a.sensitive && (
                <span className="text-[9px] font-medium uppercase tracking-wider text-warning border border-warning/40 rounded px-1 py-0.5">
                  {L("sensible", "sensitive")}
                </span>
              )}
            </span>
            <select
              value={permissions[a.key] || "none"}
              onChange={(e) => set(a.key, e.target.value)}
              disabled={locked}
              title={locked ? L("Seul un propriétaire peut accorder cette section", "Only an owner can grant this section") : ""}
              data-testid={`${testPrefix}-perm-${a.key}`}
              className="font-data text-[11px] uppercase tracking-[0.1em] border border-ash px-2 py-1 bg-transparent focus:outline-none rounded disabled:cursor-not-allowed"
            >
              <option value="none">{L("Sans accès", "No access")}</option>
              <option value="view">{L("Lecture seule", "View only")}</option>
              <option value="manage">{L("Complet (voir + éditer)", "Full (view + edit)")}</option>
            </select>
          </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-glacier leading-relaxed">
        {L("Les sections « sensibles » (Équipe, Journal, Corbeille) donnent un pouvoir élevé — accordez-les avec prudence. Un membre ne peut jamais se promouvoir propriétaire ni révoquer un propriétaire.",
          "“Sensitive” sections (Team, Audit log, Trash) grant elevated power — grant them carefully. A member can never promote themselves to owner or revoke an owner.")}
      </p>
    </div>
  );
}
