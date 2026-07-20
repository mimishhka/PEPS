// frontend/src/components/AdminGate.jsx
import { useState, useEffect } from "react";
import api from "../lib/api";
import { FnMark } from "./brand";

const GATE_KEY = "fironova_admin_gate_ok";

export default function AdminGate({ children }) {
  const [ok, setOk] = useState(() => sessionStorage.getItem(GATE_KEY) === "1");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (ok) { setChecking(false); return; }
    let cancelled = false;
    api.get("/admin/autologin")
      .then(() => {
        if (!cancelled) {
          sessionStorage.setItem(GATE_KEY, "1");
          setOk(true);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [ok]);

  if (checking) return null;
  if (ok) return children;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/admin/gate/verify", { code });
      sessionStorage.setItem(GATE_KEY, "1");
      setOk(true);
    } catch {
      setError("Not found.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-nordfjord px-6" data-testid="admin-gate-page">
      <form onSubmit={submit} className="w-full max-w-sm bg-clinical rounded-2xl p-10 shadow-[0_40px_80px_-30px_rgba(0,0,0,.5)]" data-testid="admin-gate-form">
        <div className="flex justify-center mb-5">
          <FnMark size={44} frame="#0B2E4F" spark="#00B8D4" />
        </div>
        <h1 className="text-center font-display text-xl font-bold text-nordfjord tracking-[0.08em]">FIRONOVA OPS</h1>
        <p className="text-center font-data text-[11px] uppercase tracking-[0.24em] text-nova mt-2 mb-8">Restricted · Restreint</p>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          placeholder="Password"
          data-testid="admin-gate-code"
          className="w-full rounded-full border-[1.5px] border-nova/60 px-5 py-3.5 bg-white text-center text-nordfjord tracking-[0.2em] focus:outline-none focus:border-nova"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full btn-pill btn-nova mt-4 disabled:opacity-40"
        >
          {busy ? "…" : "Enter"}
        </button>
        {error && <p className="mt-4 text-center font-data text-[10px] uppercase tracking-[0.2em] text-glacier">{error}</p>}
      </form>
    </div>
  );
}
