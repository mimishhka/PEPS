import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";

export default function About() {
  useDocumentHead({ title: "About", path: "/about" });
  const { lang } = useLang();
  const isFr = lang === "fr";
  return (
    <div data-testid="about-page">
      <section className="border-b border-ink grid lg:grid-cols-2">
        <div className="p-12 lg:p-20">
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// 01 · ABOUT</div>
          <h1 className="font-display text-5xl sm:text-7xl font-extrabold uppercase tracking-tight mt-3 leading-[0.9]">
            {isFr ? "Du nord. Pour la recherche." : "From the north. For research."}
          </h1>
          <p className="mt-8 text-lg text-foreground/75 max-w-md leading-relaxed">
            {isFr
              ? "FIRONOVA est un fournisseur canadien indépendant de peptides de référence de pureté laboratoire. Chaque lot est analysé par un laboratoire tiers (HPLC, spectrométrie de masse) avant expédition depuis nos installations à Montréal."
              : "FIRONOVA is an independent Canadian supplier of laboratory-grade reference peptides. Every batch is third-party lab tested (HPLC, mass spectrometry) before shipping from our Montréal facility."}
          </p>
        </div>
        <div className="relative min-h-[500px] bg-secondary border-l border-ink">
          <img src="https://images.unsplash.com/photo-1616996691748-3f5f78093ab0?auto=format&fit=crop&w=1200&q=80" alt="Lab" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "grayscale(0.8) contrast(1.1)" }} />
        </div>
      </section>

      <section className="border-b border-ink grid sm:grid-cols-3">
        {[
          { n: "01", t: isFr ? "Synthèse" : "Synthesis", d: isFr ? "Synthèse en phase solide Fmoc. Pureté confirmée par HPLC à ≥ 99 %." : "Fmoc solid-phase synthesis. HPLC-confirmed purity ≥ 99%." },
          { n: "02", t: isFr ? "Test indépendant" : "Independent testing", d: isFr ? "Chaque lot vérifié par un laboratoire tiers ISO 17025." : "Every batch verified by an ISO 17025 third-party lab." },
          { n: "03", t: isFr ? "Expédition canadienne" : "Canadian shipping", d: isFr ? "Postes Canada Xpresspost. Suivi inclus. Discret." : "Canada Post Xpresspost. Tracked. Discreet." },
        ].map((s) => (
          <div key={s.n} className="p-10 border-r border-ink/15">
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">{s.n}</div>
            <h3 className="font-display text-2xl font-bold uppercase tracking-tight mt-3">{s.t}</h3>
            <p className="mt-4 text-sm text-foreground/70 leading-relaxed">{s.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
