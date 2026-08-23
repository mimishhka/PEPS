import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { MolecularMesh, NovaSpark, Reveal } from "../components/brand";

export default function About() {
  useDocumentHead({ title: "About", path: "/about" });
  const { lang } = useLang();
  const isFr = lang === "fr";

  const steps = [
    { n: "01", t: isFr ? "Synthèse" : "Synthesis", d: isFr ? "Synthèse en phase solide Fmoc. Pureté confirmée par HPLC à ≥ 99 %." : "Fmoc solid-phase synthesis. HPLC-confirmed purity ≥ 99%." },
    { n: "02", t: isFr ? "Test indépendant" : "Independent testing", d: isFr ? "Chaque lot vérifié par un laboratoire tiers ISO 17025." : "Every batch verified by an ISO 17025 third-party lab." },
    { n: "03", t: isFr ? "Expédition canadienne" : "Canadian shipping", d: isFr ? "Postes Canada Xpresspost. Suivi inclus. Discret." : "Canada Post Xpresspost. Tracked. Discreet." },
  ];

  return (
    <div data-testid="about-page" className="bg-clinical min-h-screen">
      <section className="relative bg-nordfjord text-clinical overflow-hidden">
        <MolecularMesh opacity={0.26} />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-24 lg:py-32">
          <Reveal>
            <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-5 flex items-center gap-2">
              <span className="inline-block w-8 h-px bg-nova" /> {isFr ? "01 · À PROPOS" : "01 · ABOUT"}
            </p>
          </Reveal>
          <Reveal delay={90}>
            <h1 className="font-display text-[44px] sm:text-[64px] font-bold leading-[1.02] tracking-[-0.02em] max-w-3xl">
              {isFr ? "Du nord. " : "From the north. "}<span className="text-nova">{isFr ? "Pour la recherche." : "For research."}</span>
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <p className="mt-8 text-lg text-[#B7CADD] max-w-2xl leading-relaxed">
              {isFr
                ? "FIRONOVA est un fournisseur canadien indépendant de peptides de référence de pureté laboratoire. Chaque lot est analysé par un laboratoire tiers (HPLC, spectrométrie de masse) avant expédition depuis nos installations à Montréal."
                : "FIRONOVA is an independent Canadian supplier of laboratory-grade reference peptides. Every batch is third-party lab tested (HPLC, mass spectrometry) before shipping from our Montréal facility."}
            </p>
          </Reveal>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-24">
        <div className="grid sm:grid-cols-3 gap-6">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 90}>
              <div className="rounded-xl border border-ash bg-white p-8 h-full">
                <div className="flex items-center justify-between mb-5">
                  <span className="font-data text-sm font-semibold text-nova">{s.n}</span>
                  <NovaSpark size={18} />
                </div>
                <h3 className="font-display text-xl font-bold text-nordfjord mb-3">{s.t}</h3>
                <p className="text-sm text-glacier leading-relaxed">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
