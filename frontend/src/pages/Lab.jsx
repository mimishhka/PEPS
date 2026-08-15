import { useState } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";

export default function Lab() {
  useDocumentHead({ title: "Lab", description: "Verify a Fironova HPLC certificate of analysis by lot number, or track your order.", path: "/lab" });
  const { lang } = useLang();
  const isFr = lang === "fr";

  const [lot, setLot] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);

  const [orderId, setOrderId] = useState("");
  const [trackEmail, setTrackEmail] = useState("");
  const [tracking, setTracking] = useState(false);
  const [track, setTrack] = useState(null);

  const verify = async () => {
    const q = lot.trim();
    if (!q) return;
    setVerifying(true);
    setResult(null);
    try {
      const { data } = await api.get("/products");
      const list = Array.isArray(data) ? data : [];
      let hit = null;
      for (const p of list) {
        const lots = [];
        if (p.coa_lot) lots.push({ lot: p.coa_lot, url: p.coa_url, name: p.name_en, purity: p.purity });
        (p.variants || []).forEach((v) => {
          if (v.coa_lot) lots.push({ lot: v.coa_lot, url: v.coa_url, name: p.name_en, purity: p.purity });
        });
        const m = lots.find((x) => String(x.lot).toLowerCase() === q.toLowerCase());
        if (m) { hit = m; break; }
      }
      setResult(hit ? { found: true, ...hit } : { found: false });
    } catch {
      toast.error(isFr ? "Vérification impossible pour le moment." : "Verification unavailable right now.");
    } finally {
      setVerifying(false);
    }
  };

  const doTrack = async () => {
    const id = orderId.trim();
    if (!id) return;
    if (!trackEmail.trim()) {
      toast.error(isFr ? "Courriel requis" : "Email required");
      return;
    }
    setTracking(true);
    setTrack(null);
    try {
      await api.post(`/orders/${encodeURIComponent(id)}/guest-access`, { email: trackEmail.trim() });
      setTrack({ accessRequested: true });
    } catch {
      setTrack({ tracked: false, reason: "not_found" });
    } finally {
      setTracking(false);
    }
  };

  return (
    <div data-testid="lab-page" className="bg-clinical min-h-screen">
      <div className="max-w-3xl mx-auto px-6 lg:px-8 py-20">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4 flex items-center gap-2">
          <span className="inline-block w-8 h-px bg-nova" /> {isFr ? "LABO · LAB" : "LAB · LABO"}
        </p>
        <h1 className="font-display text-[44px] sm:text-[52px] font-semibold text-nordfjord leading-tight mb-4">
          {isFr ? "Vérification de certificat" : "Certificate verification"}
        </h1>
        <p className="text-lg text-glacier max-w-xl mb-8">
          {isFr
            ? "Entrez le numéro de lot imprimé sur votre fiole pour afficher son certificat d'analyse HPLC."
            : "Enter the lot number printed on your vial to pull its HPLC certificate of analysis."}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            value={lot}
            onChange={(e) => setLot(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            placeholder="FN-26008"
            data-testid="lab-lot-input"
            className="flex-1 rounded-full bg-white border border-ash px-6 py-4 text-nordfjord text-[15px] outline-none focus:border-nova placeholder:text-glacier font-data"
          />
          <button onClick={verify} disabled={verifying} data-testid="lab-verify-btn" className="btn-pill btn-nova disabled:opacity-40">
            {verifying ? "…" : isFr ? "Vérifier" : "Verify"}
          </button>
        </div>

        {result && (
          <div className="rounded-2xl border border-ash bg-white p-6 mb-16" data-testid="lab-verify-result">
            {result.found ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="font-data text-[10px] uppercase tracking-[0.2em] text-success mb-1">{isFr ? "LOT VÉRIFIÉ" : "LOT VERIFIED"}</div>
                  <div className="font-display text-xl font-bold text-nordfjord">{result.name}</div>
                  <div className="font-data text-[12px] text-glacier mt-1">{result.lot} · {result.purity}</div>
                </div>
                {result.url ? (
                  <a href={result.url} target="_blank" rel="noopener noreferrer" className="btn-pill btn-outline">
                    {isFr ? "Télécharger le COA" : "Download COA"} ↓
                  </a>
                ) : (
                  <span className="font-data text-[11px] uppercase tracking-[0.16em] text-warning">{isFr ? "COA à venir" : "COA pending"}</span>
                )}
              </div>
            ) : (
              <div className="font-data text-sm text-glacier">
                {isFr ? "Aucun lot ne correspond à ce numéro." : "No lot matches that number."}
              </div>
            )}
          </div>
        )}

        <h2 className="font-display text-[28px] font-semibold text-nordfjord mb-6">
          {isFr ? "Suivre votre commande" : "Track your order"}
        </h2>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="FN-2026-000121"
            data-testid="lab-order-input"
            className="flex-1 rounded-full bg-white border border-ash px-6 py-4 text-nordfjord text-[15px] outline-none focus:border-nova placeholder:text-glacier font-data"
          />
          <input
            value={trackEmail}
            onChange={(e) => setTrackEmail(e.target.value)}
            placeholder="research@lab.ca"
            data-testid="lab-track-email"
            className="flex-1 rounded-full bg-white border border-ash px-6 py-4 text-nordfjord text-[15px] outline-none focus:border-nova placeholder:text-glacier font-data"
          />
        </div>
        <button onClick={doTrack} disabled={tracking} data-testid="lab-track-btn" className="btn-pill bg-nordfjord text-white hover:bg-glacier disabled:opacity-40">
          {tracking ? "…" : isFr ? "Suivre" : "Track"}
        </button>

        {track && (
          <div className="mt-6 rounded-2xl border border-ash bg-white p-6" data-testid="lab-track-result">
            {track.accessRequested ? (
              <div className="font-data text-sm text-glacier">
                {isFr
                  ? "Si la commande et le courriel correspondent, un lien de suivi privé vous sera envoyé."
                  : "If the order and email match, a private tracking link will be sent."}
              </div>
            ) : track.tracked ? (
              <div>
                <div className="font-data text-[10px] uppercase tracking-[0.2em] text-success mb-1">{isFr ? "SUIVI ACTIF" : "TRACKING ACTIVE"}</div>
                <div className="font-data text-sm text-nordfjord">{track.status || track.description || (isFr ? "En transit" : "In transit")}</div>
                {track.pin && <div className="font-data text-[12px] text-glacier mt-1">PIN · {track.pin}</div>}
              </div>
            ) : (
              <div className="font-data text-sm text-glacier">
                {track.reason === "no_tracking_number"
                  ? (isFr ? "Commande trouvée — aucun numéro de suivi encore assigné." : "Order found — no tracking number assigned yet.")
                  : track.reason === "not_found"
                  ? (isFr ? "Aucune commande trouvée pour cet identifiant." : "No order found for that ID.")
                  : (isFr ? "Suivi indisponible pour le moment." : "Tracking unavailable right now.")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
