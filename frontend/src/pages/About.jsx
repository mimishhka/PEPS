import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { MolecularMesh, NovaSpark, Reveal } from "../components/brand";

export default function About() {
  const { lang } = useLang();
  useDocumentHead({ title: lang === "fr" ? "À propos" : "About", path: "/about" });
  const isFr = lang === "fr";

  const steps = [
    { n: "01", t: isFr ? "Synthèse" : "Synthesis", d: isFr ? "Synthèse en phase solide Fmoc. Pureté confirmée par HPLC à ≥ 99 %." : "Fmoc solid-phase synthesis. HPLC-confirmed purity ≥ 99%." },
    { n: "02", t: isFr ? "Test indépendant" : "Independent testing", d: isFr ? "Chaque lot vérifié par un laboratoire tiers ISO 17025." : "Every batch verified by an ISO 17025 third-party lab." },
    { n: "03", t: isFr ? "Expédition canadienne" : "Canadian shipping", d: isFr ? "Postes Canada Xpresspost. Suivi inclus. Discret." : "Canada Post Xpresspost. Tracked. Discreet." },
  ];

  return (
    <div data-testid="about-page" className="bg-clinical min-h-screen">
      <section className="relative border-b border-ash">
        <MolecularMesh opacity={0.26} />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-24 lg:py-32">
          <Reveal>
            <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova-texte mb-5 flex items-center gap-2">
              <span className="inline-block w-8 h-px bg-nova" /> {isFr ? "À PROPOS" : "ABOUT"}
            </p>
          </Reveal>
          <Reveal delay={90}>
            <h1 className="font-display text-[28px] sm:text-[34px] font-semibold leading-[1.1] tracking-[-0.01em] max-w-3xl text-nordfjord">
              {isFr ? "Du nord. " : "From the north. "}<span className="text-nova-texte">{isFr ? "Pour la recherche." : "For research."}</span>
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <p className="mt-8 text-base text-glacier max-w-2xl leading-relaxed">
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
                  <span className="font-data text-sm font-semibold text-nova-texte">{s.n}</span>
                  <NovaSpark size={18} />
                </div>
                <h3 className="font-display text-xl font-bold text-nordfjord mb-3">{s.t}</h3>
                <p className="text-sm text-glacier leading-relaxed">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CE QUI NOUS DEFINI. Trois faits, sans promesse : la recherche
          seulement, les deux langues, l'ancrage canadien. Rien ici n'invente
          — tout reprend ce que le site affirme deja ailleurs. */}
      <section className="border-t border-ash bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-24">
          <Reveal>
            <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova-texte mb-5 flex items-center gap-2">
              <span className="inline-block w-8 h-px bg-nova" /> {isFr ? "CE QUI NOUS DÉFINIT" : "WHAT DEFINES US"}
            </p>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-10">
            <Reveal delay={60}>
              <h3 className="font-display text-xl font-bold text-nordfjord mb-3">
                {isFr ? "Recherche seulement" : "Research only"}
              </h3>
              <p className="text-sm text-glacier leading-relaxed">
                {isFr
                  ? "Nos peptides sont des réactifs de recherche, destinés exclusivement aux laboratoires et aux chercheurs. Aucun produit n'est destiné à un usage humain ou vétérinaire, et chaque page le rappelle."
                  : "Our peptides are research reagents, intended exclusively for laboratories and researchers. No product is intended for human or veterinary use, and every page says so."}
              </p>
            </Reveal>
            <Reveal delay={140}>
              <h3 className="font-display text-xl font-bold text-nordfjord mb-3">
                {isFr ? "Bilingue, de bout en bout" : "Bilingual, end to end"}
              </h3>
              <p className="text-sm text-glacier leading-relaxed">
                {isFr
                  ? "Catalogue, commande, soutien : tout se fait en français et en anglais. Une équipe québécoise répond dans votre langue, pas par traduction automatique."
                  : "Catalogue, checkout, support: everything works in French and English. A Québec-based team answers in your language, not through machine translation."}
              </p>
            </Reveal>
            <Reveal delay={220}>
              <h3 className="font-display text-xl font-bold text-nordfjord mb-3">
                {isFr ? "Expédié du Canada" : "Shipped from Canada"}
              </h3>
              <p className="text-sm text-glacier leading-relaxed">
                {isFr
                  ? "Nos installations sont à Montréal. Les colis partent par Postes Canada Xpresspost, avec suivi, dans un emballage discret."
                  : "Our facility is in Montréal. Parcels leave via Canada Post Xpresspost, tracked, in discreet packaging."}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* NOS ENGAGEMENTS. Des faits verifiables, pas des slogans. */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-24">
        <Reveal>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova-texte mb-5 flex items-center gap-2">
            <span className="inline-block w-8 h-px bg-nova" /> {isFr ? "NOS ENGAGEMENTS" : "OUR COMMITMENTS"}
          </p>
        </Reveal>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { t: isFr ? "Chaque lot, testé" : "Every batch, tested",
              d: isFr ? "Analyse par un laboratoire tiers — HPLC et spectrométrie de masse — avant mise en vente. Le certificat d'analyse (COA) du lot est téléchargeable sur la fiche du produit."
                      : "Third-party analysis — HPLC and mass spectrometry — before release. The batch certificate of analysis (COA) is downloadable from the product page." },
            { t: isFr ? "Des lots frais" : "Fresh batches",
              d: isFr ? "Nous commandons en petites quantités et renouvelons régulièrement : ce que vous recevez n'a pas dormi des années sur une étagère."
                      : "We order in small quantities and restock regularly: what you receive has not been sitting on a shelf for years." },
            { t: isFr ? "Un vrai service" : "Real support",
              d: isFr ? "Une question sur un composé, une commande, un certificat ? Une personne vous répond, dans votre langue, sous un à deux jours ouvrables."
                      : "A question about a compound, an order, a certificate? A person answers, in your language, within one to two business days." },
          ].map((e, i) => (
            <Reveal key={e.t} delay={i * 90}>
              <div className="rounded-xl border border-ash bg-white p-8 h-full">
                <h3 className="font-display text-xl font-bold text-nordfjord mb-3">{e.t}</h3>
                <p className="text-sm text-glacier leading-relaxed">{e.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
