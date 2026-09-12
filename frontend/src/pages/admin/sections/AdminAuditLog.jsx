// frontend/src/pages/admin/sections/AdminAuditLog.jsx — NOUVEAU fichier.
// Journal d'audit — owner only. Voir server.py: _log_action() + require_area()
// journalisent automatiquement toute action "manage" (mutation) sur les 35+
// endpoints admin, plus les actions explicites de gestion d'équipe.
import { useEffect, useState } from "react";
import { ShieldCheck, User } from "lucide-react";
import api from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";
import { Th } from "../ui";

export default function AdminAuditLog() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    api.get("/admin/audit-log?limit=300").then((r) => setEntries(r.data)).catch(() => setEntries([]));
  }, []);

  return (
    <div className="p-8" data-testid="admin-audit-log">
      <div className="mb-6">
        <div className="font-data text-[11px] tracking-[0.18em] text-nova">Journal</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-1 text-nordfjord">
          {L("Journal d'activité", "Activity log")}
        </h1>
        <p className="font-data text-xs text-glacier mt-1">
          {L("Chaque modification faite dans l'administration, par qui et quand.",
             "Every change made in the admin panel, by whom, and when.")}
        </p>
      </div>

      {entries === null ? (
        <p className="font-data text-xs text-glacier">
          {L("Chargement…", "Loading…")}
        </p>
      ) : entries.length === 0 ? (
        <div className="bg-card border border-ash/60 rounded-xl p-8 text-center text-glacier font-data text-xs">
          {L("Aucune activité enregistrée", "No activity recorded yet")}
        </div>
      ) : (
        <div className="bg-card border border-ash/60 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>{L("Quand", "When")}</Th>
                <Th>{L("Qui", "Who")}</Th>
                <Th>{L("Zone", "Area")}</Th>
                <Th>{L("Action", "Action")}</Th>
                <Th>{L("Détail", "Detail")}</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-ash/40" data-testid={`audit-row-${e.id}`}>
                  <td className="px-6 py-3 font-data text-[11px] text-glacier whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5">
                      {e.role === "admin" ? <ShieldCheck size={13} className="text-nova" /> : <User size={13} className="text-glacier" />}
                      <span className="text-xs text-nordfjord">{e.user_name || e.user_email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    {e.area && (
                      <span className="font-data text-[10px] bg-clinical rounded-full px-2 py-0.5 text-glacier">
                        {e.area}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 font-data text-[11px] text-nordfjord">{e.action}</td>
                  <td className="px-6 py-3 text-xs text-glacier max-w-md truncate" title={e.detail}>
                    {e.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
