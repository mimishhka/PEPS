import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Mail } from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError } from "../../../lib/api";
import { Th } from "../ui";

export default function AdminSubscribers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/subscribers", {
        params: status === "all" ? {} : { status },
      });
      setRows(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const subscribed = rows.filter((r) => r.status === "subscribed").length;
    const converted = rows.filter((r) => r.converted).length;
    // Taux de conversion = abonnés ayant créé un compte. C'est la seule
    // métrique qui dit si la promesse des 15 % fonctionne.
    const rate = rows.length ? Math.round((converted / rows.length) * 100) : 0;
    return { total: rows.length, subscribed, converted, rate };
  }, [rows]);

  return (
    <div className="p-8" data-testid="admin-subscribers">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-copper">// SUBSCRIBERS</div>
          <h1 className="font-display text-3xl font-bold tracking-[-0.01em] mt-2 text-ink">Launch list</h1>
        </div>
        <a
          href={`${API_BASE}/admin/subscribers.csv${status === "all" ? "" : `?status=${status}`}`}
          target="_blank" rel="noopener noreferrer"
          data-testid="export-subscribers-csv"
          className="rounded-full bg-ink text-paper font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2"
        >
          <Download size={14} /> CSV
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { l: "Total", v: stats.total },
          { l: "Subscribed", v: stats.subscribed },
          { l: "Converted", v: stats.converted },
          { l: "Conversion", v: `${stats.rate}%` },
        ].map((c) => (
          <div key={c.l} className="bg-paper border border-faint rounded-md px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-copper">{c.l}</div>
            <div className="font-mono text-2xl font-bold tabular-nums text-ink mt-1">{c.v}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {["all", "subscribed", "unsubscribed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            data-testid={`subscribers-filter-${s}`}
            className={`rounded-full font-mono text-[10px] uppercase tracking-[0.2em] px-4 py-1.5 border ${
              status === s ? "bg-garnet text-paper border-garnet" : "border-faint text-inkmuted"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="bg-paper border border-faint rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-faint font-mono text-[10px] uppercase tracking-[0.2em] text-copper">
              <Th>Email</Th>
              <Th>Lang</Th>
              <Th>Source</Th>
              <Th>Status</Th>
              <Th>Account</Th>
              <Th>Consent (CASL)</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-inkmuted">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-inkmuted">
                <Mail size={18} className="inline mr-2" /> No subscribers yet.
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-faint last:border-0" data-testid={`subscriber-row-${r.id}`}>
                <td className="px-4 py-3 font-mono text-xs text-ink">{r.email}</td>
                <td className="px-4 py-3 font-mono text-xs uppercase text-inkmuted">{r.lang}</td>
                <td className="px-4 py-3 font-mono text-xs text-inkmuted">{r.source || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full font-mono text-[10px] uppercase tracking-[0.2em] px-2.5 py-1 border ${
                    r.status === "subscribed" ? "bg-garnet text-paper border-garnet" : "border-faint text-inkmuted"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {r.converted
                    ? <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#2E7D52]">Registered</span>
                    : <span className="font-mono text-[10px] text-inkmuted">—</span>}
                </td>
                {/* consent_at + consent_ip = la preuve exigée en cas de plainte CASL */}
                <td className="px-4 py-3 font-mono text-[10px] text-inkmuted">
                  {r.consent_at ? `${String(r.consent_at).slice(0, 10)} · ${r.consent_ip || "—"}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
