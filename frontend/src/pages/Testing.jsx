import { Link } from "react-router-dom";
import { ArrowRight, FileText, Clock, MinusCircle } from "lucide-react";
import { useLang } from "../contexts/LanguageContext";
import { Reveal, NovaSpark, FnMark } from "../components/brand";

/* ============================================================================
 * FIRONOVA — Testing approach / Approche des tests
 * Page de transparence. Aucun claim de pureté global, aucun "100% testé".
 * Route à ajouter dans App.js :  <Route path="/testing" element={<Testing />} />
 * ==========================================================================*/

export default function Testing() {
  const { lang } = useLang();
  const fr = lang === "fr";

  const eyebrow = fr ? "TRANSPARENCE" : "TRANSPARENCY";
  const title = fr ? "Notre approche des tests" : "Our testing approach";
  const lede = fr
    ? "Nous n'affirmons que ce que nous pouvons documenter. Voici comment lire l'information de test sur chaque produit."
    : "We state only what we can document. Here's how to read the test information on each product.";

  const coverTitle = fr ? "Ce qu'un COA couvre" : "What a COA covers";
  const coverBody = fr
    ? "Un certificat d'analyse (COA) porte sur un lot précis, identifié par son numéro. Il ne s'applique pas automatiquement aux autres lots du même produit. Lorsqu'un COA est disponible, il est rattaché directement à la variante concernée sur la fiche produit, et publié tel que reçu de nos laboratoires, sans modification."
    : "A certificate of analysis (COA) applies to one specific lot, identified by its number. It does not automatically apply to other lots of the same product. When available, a COA is attached directly to the relevant variant on the product page, and published exactly as received from our laboratories, unmodified.";

  const statuses = fr
    ? [
        { icon: FileText, k: "COA disponible", v: "Le rapport du lot est publié et téléchargeable depuis la fiche produit." },
        { icon: Clock, k: "COA à venir", v: "Le lot est en attente de son rapport, qui sera publié dès réception." },
        { icon: MinusCircle, k: "Sans COA", v: "Aucun rapport n'est publié pour ce lot à ce jour." },
      ]
    : [
        { icon: FileText, k: "COA available", v: "The lot's report is published and downloadable from the product page." },
        { icon: Clock, k: "COA pending", v: "The lot is awaiting its report, which will be published on receipt." },
        { icon: MinusCircle, k: "No COA", v: "No report is published for this lot at this time." },
      ];
  const statusesTitle = fr ? "Statuts possibles" : "Possible statuses";

  const commitTitle = fr ? "Notre engagement" : "Our commitment";
  const commitBody = fr
    ? "Un statut affiché correspond toujours à l'état réel du lot que vous consultez. Nous ne présentons pas un test partiel comme un test complet, et nous n'affichons aucune donnée de pureté qui ne provienne pas d'un rapport rattaché à un lot précis."
    : "A displayed status always reflects the real state of the lot you are viewing. We do not present a partial test as a complete one, and we display no purity figure that does not come from a report tied to a specific lot.";

  const ctaCatalog = fr ? "Voir le catalogue" : "Browse the catalog";
  const ruo = fr
    ? "Produits destinés à un usage de recherche en laboratoire uniquement. Non destinés à un usage humain ou vétérinaire."
    : "Products for laboratory research use only. Not for human or veterinary use.";

  return (
    <div data-testid="testing-page">
      {/* HERO */}
      <section className="relative bg-nordfjord text-clinical overflow-hidden">
        <div className="absolute -right-16 -top-16 opacity-20"><FnMark size={260} frame="#00B8D4" spark="#00B8D4" /></div>
        <div className="relative max-w-4xl mx-auto px-6 lg:px-8 pt-20 pb-16">
          <Reveal>
            <p className="font-data text-[11px] font-semibold uppercase tracking-[0.22em] text-nova mb-6 flex items-center gap-2">
              <NovaSpark size={13} /> {eyebrow}
            </p>
          </Reveal>
          <Reveal delay={90}>
            <h1 className="font-display font-bold leading-[1.05] tracking-[-0.02em] mb-6" style={{ fontSize: "clamp(34px,4.6vw,56px)" }} data-testid="testing-title">
              {title}
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="text-lg text-[#B7CADD] max-w-[56ch] leading-relaxed">{lede}</p>
          </Reveal>
        </div>
      </section>

      {/* CE QU'UN COA COUVRE */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <Reveal>
            <h2 className="font-display text-[28px] font-semibold text-nordfjord mb-4">{coverTitle}</h2>
            <p className="text-[17px] text-glacier leading-relaxed">{coverBody}</p>
          </Reveal>
        </div>
      </section>

      {/* STATUTS */}
      <section className="py-16 bg-white border-y border-ash/60">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <Reveal><h2 className="font-display text-[28px] font-semibold text-nordfjord mb-10">{statusesTitle}</h2></Reveal>
          <div className="space-y-4">
            {statuses.map((s, i) => {
              const Icon = s.icon;
              return (
                <Reveal key={s.k} delay={i * 80}>
                  <div className="flex items-start gap-4 rounded-2xl border border-ash/60 p-6">
                    <span className="mt-0.5 text-nova"><Icon size={22} /></span>
                    <div>
                      <p className="font-data text-[12px] uppercase tracking-[0.16em] text-nordfjord mb-1.5">{s.k}</p>
                      <p className="text-[15px] text-glacier leading-relaxed">{s.v}</p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ENGAGEMENT */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <Reveal>
            <h2 className="font-display text-[28px] font-semibold text-nordfjord mb-4">{commitTitle}</h2>
            <p className="text-[17px] text-glacier leading-relaxed mb-10">{commitBody}</p>
            <Link to="/catalog" data-testid="testing-cta-catalog" className="btn-pill btn-nova group inline-flex">
              {ctaCatalog} <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* RUO */}
      <section className="bg-nordfjord">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 py-6">
          <p className="font-data text-[11px] text-center uppercase tracking-[0.14em] text-[#8FB3C9] leading-relaxed">{ruo}</p>
        </div>
      </section>
    </div>
  );
}
