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
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// AUDIT</div>
        <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight mt-2">
          {L("Journal d'activité", "Activity log")}
        </h1>
        <p className="font-mono text-xs text-foreground/60 mt-1">
          {L("Chaque modification faite dans l'administration, par qui et quand.",
             "Every change made in the admin panel, by whom, and when.")}
        </p>
      </div>

      {entries === null ? (
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/50">
          {L("Chargement…", "Loading…")}
        </p>
      ) : entries.length === 0 ? (
        <div className="bg-white border border-ink/10 p-8 text-center text-foreground/50 font-mono text-xs uppercase tracking-[0.15em]">
          {L("Aucune activité enregistrée", "No activity recorded yet")}
        </div>
      ) : (
        <div className="bg-white border border-ink/10 overflow-x-auto">
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
                <tr key={e.id} className="border-t border-ink/5" data-testid={`audit-row-${e.id}`}>
                  <td className="px-6 py-3 font-mono text-[11px] text-foreground/60 whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5">
                      {e.role === "admin" ? <ShieldCheck size={13} className="text-copper" /> : <User size={13} className="text-foreground/40" />}
                      <span className="text-xs">{e.user_name || e.user_email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    {e.area && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] bg-secondary px-2 py-0.5">
                        {e.area}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 font-mono text-[11px]">{e.action}</td>
                  <td className="px-6 py-3 text-xs text-foreground/60 max-w-md truncate" title={e.detail}>
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
