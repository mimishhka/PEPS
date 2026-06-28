import { useLang } from "../contexts/LanguageContext";

export default function Lab() {
  const { lang } = useLang();
  const isFr = lang === "fr";
  const reports = [
    { name: "BPC-157", lot: "BPC-2026-Q1-001", purity: "99.34%", date: "2026-01-12" },
    { name: "TB-500", lot: "TB5-2026-Q1-003", purity: "99.12%", date: "2026-01-15" },
    { name: "Semaglutide", lot: "SMG-2026-Q1-007", purity: "99.08%", date: "2026-01-20" },
    { name: "Tirzepatide", lot: "TZP-2026-Q1-004", purity: "99.21%", date: "2026-01-22" },
    { name: "Ipamorelin", lot: "IPM-2026-Q1-011", purity: "99.51%", date: "2026-01-28" },
    { name: "Epitalon", lot: "EPT-2026-Q1-005", purity: "99.33%", date: "2026-02-02" },
  ];
  return (
    <div data-testid="lab-page">
      <section className="border-b border-ink px-6 lg:px-12 py-16">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// LAB · COA</div>
        <h1 className="font-display text-5xl sm:text-7xl font-extrabold uppercase tracking-tight mt-3">
          {isFr ? "Rapports de laboratoire" : "Laboratory reports"}
        </h1>
        <p className="mt-4 max-w-xl text-foreground/70">
          {isFr
            ? "Téléchargez les certificats d'analyse (COA) pour chaque lot. Tests HPLC et spectrométrie de masse effectués par un laboratoire tiers ISO 17025."
            : "Download Certificates of Analysis (COA) for each batch. HPLC and mass spectrometry tests by an ISO 17025 third-party laboratory."}
        </p>
      </section>
      <section className="border-b border-ink">
        <table className="w-full font-mono text-xs">
          <thead className="bg-ink text-white">
            <tr>
              <th className="px-6 py-4 text-left uppercase tracking-[0.2em]">Compound</th>
              <th className="px-6 py-4 text-left uppercase tracking-[0.2em]">Lot</th>
              <th className="px-6 py-4 text-left uppercase tracking-[0.2em]">Purity</th>
              <th className="px-6 py-4 text-left uppercase tracking-[0.2em]">Date</th>
              <th className="px-6 py-4 text-right uppercase tracking-[0.2em]">COA</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.lot} className="border-t border-ink/15 hover:bg-secondary" data-testid={`coa-row-${r.lot}`}>
                <td className="px-6 py-4 font-bold">{r.name}</td>
                <td className="px-6 py-4">{r.lot}</td>
                <td className="px-6 py-4">{r.purity}</td>
                <td className="px-6 py-4 text-foreground/70">{r.date}</td>
                <td className="px-6 py-4 text-right">
                  <button className="border border-ink px-3 py-2 hover:bg-ink hover:text-white uppercase tracking-[0.15em]">
                    PDF ↓
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
