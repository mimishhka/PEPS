// frontend/src/pages/admin/sections/AdminEmails.jsx
// Section Système › Emails. Permet de modifier tous les emails transactionnels
// (sujet + corps, FR + EN), avec aide-mémoire des variables et aperçu en direct.
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Mail, Save, RotateCcw, Eye } from "lucide-react";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";
import { useConfirm } from "../../../components/ConfirmDialog";

/* Ce que chaque bloc automatique injecte. Miroir de _render_block
 * (backend/services/mail.py) : si un bloc y est ajoute, il faut une ligne
 * ici, sinon l'ecran annonce « contenu genere a l'envoi » sans plus. */
const BLOCS = {
  interac: { fr: "les instructions de virement Interac et le récapitulatif de la commande",
             en: "the Interac transfer instructions and the order recap" },
  crypto: { fr: "l'adresse de paiement en cryptomonnaie et le récapitulatif",
            en: "the cryptocurrency payment address and the order recap" },
  items: { fr: "le récapitulatif des articles, des totaux et de l'adresse de livraison",
           en: "the recap of items, totals and shipping address" },
  tracking: { fr: "le numéro de suivi, s'il existe",
              en: "the tracking number, when one exists" },
  refund_detail: { fr: "le montant remboursé",
                   en: "the refunded amount" },
};

export default function AdminEmails() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const confirm = useConfirm();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [previewLang, setPreviewLang] = useState("fr");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/email-templates");
      setTemplates(data.templates || []);
      if (!selected && data.templates?.length) selectTemplate(data.templates[0]);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectTemplate = (t) => {
    setSelected(t.key);
    setForm({
      subject_fr: t.subject_fr || "", subject_en: t.subject_en || "",
      heading_fr: t.heading_fr || "", heading_en: t.heading_en || "",
      // INTRO ET OUTRO ETAIENT RENDUS MAIS PAS EDITABLES.
      //
      // Le moteur assemble intro, puis le bloc contextuel, puis le corps,
      // puis l'outro (services/mail.py). Le formulaire n'offrait que le
      // corps : les deux tiers du texte d'un courriel etaient donc
      // intouchables sans passer par le code, alors que le backend les
      // acceptait depuis le debut et que la fusion les honorait.
      intro_fr: t.intro_fr || "", intro_en: t.intro_en || "",
      body_fr: t.body_fr || "", body_en: t.body_en || "",
      outro_fr: t.outro_fr || "", outro_en: t.outro_en || "",
      cta_url: t.cta_url || "", cta_label_fr: t.cta_label_fr || "", cta_label_en: t.cta_label_en || "",
      // Le bloc est retenu pour etre MONTRE, jamais modifie — voir plus bas.
      _block: t.block || "none",
      _variables: t.variables || [], _label: t.label || t.key,
    });
    setPreviewHtml(""); setPreviewSubject("");
  };

  const save = async () => {
    if (!selected || !form) return;
    setSaving(true);
    try {
      const { _variables, _label, _block, ...payload } = form;
      await api.put(`/admin/email-templates/${selected}`, payload);
      toast.success(L("Email enregistré", "Email saved"));
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!selected) return;
    if (!await confirm({ title: L("Réinitialiser cet email au texte par défaut ?", "Reset this email to default text?"), destructive: true })) return;
    try {
      await api.post(`/admin/email-templates/${selected}/reset`);
      toast.success(L("Réinitialisé", "Reset done"));
      const { data } = await api.get("/admin/email-templates");
      setTemplates(data.templates || []);
      const fresh = (data.templates || []).find((t) => t.key === selected);
      if (fresh) selectTemplate(fresh);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const preview = async () => {
    if (!selected) return;
    try {
      const { data } = await api.post(`/admin/email-templates/${selected}/preview?lang=${previewLang}`);
      setPreviewHtml(data.html);
      setPreviewSubject(data.subject);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  /* LE JETON EXACT QUE LE MOTEUR REMPLACE : deux accolades, ni plus ni moins.
   *
   * Le bouton ajoutait une paire d'accolades AUTOUR de la variable — mais
   * celles du catalogue en portent deja : `["{{order_number}}", …]`. Cliquer
   * produisait donc `{{{order_number}}}`. Le moteur, qui remplace
   * `{{order_number}}` (services/mail.py), trouvait bien son jeton a
   * l'interieur et laissait les accolades orphelines : le client recevait
   * « {FN-260930-ABCD1234} » au lieu de son numero de commande.
   *
   * Le meme defaut affichait aussi `{{{order_number}}}` SUR le bouton, ce qui
   * rendait la chose difficile a soupconner : l'ecran etait coherent avec
   * lui-meme, et faux des deux cotes.
   *
   * On normalise plutot que de supposer une forme d'entree : un gabarit cree
   * depuis OPS porte les variables que quelqu'un a tapees a la main, avec ou
   * sans accolades. On retire tout et on remet exactement deux paires.
   */
  const jetonVariable = (v) => {
    const nom = String(v || "").replace(/[{}\s]/g, "");
    return nom ? `{{${nom}}}` : "";
  };

  /* LES GABARITS DEJA PERSONNALISES PORTENT PEUT-ETRE LE DEFAUT.
   *
   * Tant que le bouton ajoutait une paire d'accolades de trop, tout texte
   * compose avec lui a ete ENREGISTRE ainsi. Corriger le bouton ne repare
   * donc pas le passe : ces gabarits continueraient d'envoyer
   * « {FN-260930-ABCD1234} » a chaque commande.
   *
   * Personne ne peut deviner lesquels sont touches sans ouvrir les treize
   * gabarits un par un. L'ecran le dit donc lui-meme, sur celui qu'on
   * regarde — c'est le seul endroit ou l'information sert.
   *
   * On ne reecrit RIEN tout seul : le bouton ci-dessous ne touche que le
   * formulaire a l'ecran, et rien n'est enregistre avant « Enregistrer ».
   * Ce sont ses textes.
   */
  const CHAMPS_TEXTE = ["subject_fr", "subject_en", "heading_fr", "heading_en",
                        "intro_fr", "intro_en", "body_fr", "body_en",
                        "outro_fr", "outro_en",
                        "cta_url", "cta_label_fr", "cta_label_en"];

  /* LES BOUTONS VISENT LE CHAMP OU L'ON TRAVAILLE.
   *
   * Ils inseraient toujours dans le corps FRANCAIS, et l'etiquette le disait
   * — « cliquez pour inserer dans le corps FR ». Le corps anglais, l'intro et
   * l'outro n'y avaient donc pas droit : il fallait taper « {{order_number}} »
   * a la main, en se souvenant du nombre exact d'accolades, ce qui est
   * precisement ce que ces boutons existent pour eviter.
   *
   * On retient le dernier champ visite. Le repli sur le corps FR conserve le
   * comportement d'avant pour qui clique un bouton sans avoir rien touche.
   */
  const [champActif, setChampActif] = useState("body_fr");
  const CHAMPS_INSERABLES = ["intro_fr", "intro_en", "body_fr", "body_en",
                             "outro_fr", "outro_en", "subject_fr", "subject_en",
                             "heading_fr", "heading_en"];
  const cibleInsertion = CHAMPS_INSERABLES.includes(champActif) ? champActif : "body_fr";
  /* UNE FONCTION, et non une constante : `.test()` sur une expression
   * reguliere globale avance `lastIndex`. Reutiliser le meme objet dans un
   * `filter` ferait donc demarrer chaque champ la ou le precedent s'est
   * arrete : le premier champ abime detecte, les suivants sautes. Un
   * avertissement partiel est plus trompeur qu'aucun.
   *
   * Une litterale a l'interieur d'une fonction cree un objet neuf a chaque
   * appel, et evite au passage tout echappement de chaine. */
  const jetonAbime = () => /\{\{\{\s*([\w.]+)\s*\}\}\}/g;

  const champsAbimes = form
    ? CHAMPS_TEXTE.filter((c) => jetonAbime().test(String(form[c] || "")))
    : [];

  const reparerJetons = () => {
    setForm((f) => {
      const suite = { ...f };
      for (const c of CHAMPS_TEXTE) {
        if (typeof suite[c] === "string") {
          suite[c] = suite[c].replace(jetonAbime(), "{{$1}}");
        }
      }
      return suite;
    });
    toast.success(L("Jetons corrigés — pensez à enregistrer",
                    "Tokens fixed — remember to save"));
  };

  const insertVar = (field, variable) => {
    const jeton = jetonVariable(variable);
    if (!jeton) return;
    setForm((f) => {
      const actuel = f[field] || "";
      // Une espace si le texte n'en finit pas par une : sans elle, la variable
      // se collait au mot precedent.
      const separateur = actuel && !/\s$/.test(actuel) ? " " : "";
      return { ...f, [field]: actuel + separateur + jeton };
    });
  };

  return (
    <div data-testid="admin-emails">
      <div className="mb-6">
        <div className="font-data text-[11px] uppercase tracking-[0.24em] text-glacier">{L("SYSTÈME", "SYSTEM")}</div>
        <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2">
          <Mail size={26} /> {L("Emails", "Emails")}
        </h1>
        <p className="text-sm text-glacier mt-1">
          {L("Modifiez le texte des emails envoyés aux clients. Chaque email part dans la langue du client (FR ou EN selon la version du site qu'il a utilisée).",
            "Edit the text of emails sent to customers. Each email is sent in the customer's language (FR or EN based on the site version they used).")}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-glacier py-16 text-center">{L("Chargement…", "Loading…")}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          {/* Liste des emails */}
          <div className="space-y-1">
            {templates.map((t) => (
              <button key={t.key} onClick={() => selectTemplate(t)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition ${
                  selected === t.key ? "bg-nordfjord text-white" : "hover:bg-clinical text-glacier"}`}>
                <div className="font-medium">{(t.label || t.key).split(" / ")[lang === "fr" ? 0 : 1] || t.label}</div>
                {t.customized && (
                  <div className={`text-[10px] mt-0.5 ${selected === t.key ? "text-white/60" : "text-nova"}`}>
                    {L("personnalisé", "customized")}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Éditeur */}
          {form && (
            <div className="space-y-5">
              {champsAbimes.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/5 p-3"
                  data-testid="email-jetons-abimes">
                  <p className="font-data text-[10px] uppercase tracking-[0.2em] text-warning mb-1">
                    {L("Jetons à corriger", "Tokens to fix")}
                  </p>
                  <p className="text-xs text-glacier leading-relaxed">
                    {L(`Ce gabarit contient des variables à trois accolades (${champsAbimes.join(", ")}). Le client reçoit alors la valeur entourée d'accolades, par exemple « {FN-260930-ABCD1234} » au lieu du numéro seul. C'est un reste de l'ancien bouton d'insertion, corrigé depuis.`,
                       `This template contains three-brace variables (${champsAbimes.join(", ")}). The customer then receives the value wrapped in braces — for example "{FN-260930-ABCD1234}" instead of the number alone. This is a leftover from the old insert button, now fixed.`)}
                  </p>
                  <button onClick={reparerJetons} data-testid="email-reparer-jetons"
                    className="mt-2 px-3 py-1.5 rounded bg-warning/15 border border-warning/40 font-data text-[11px] uppercase tracking-[0.14em] text-warning hover:bg-warning/25 transition">
                    {L("Corriger ici", "Fix here")}
                  </button>
                </div>
              )}
              {/* CE QUE LE MOTEUR ASSEMBLE, ET DANS QUEL ORDRE.
                *
                * Sans cette ligne, impossible de composer un courriel en
                * connaissance de cause : on ne peut pas savoir que le bloc
                * contextuel s'insere ENTRE l'intro et le corps, ni pourquoi un
                * gabarit affiche des instructions de paiement qu'on n'a pas
                * ecrites.
                *
                * LE BLOC RESTE EN LECTURE SEULE, et c'est delibere. Le rendre
                * modifiable permettrait de mettre « aucun » sur la
                * confirmation Interac — et d'envoyer une demande de paiement
                * SANS les instructions de paiement. Un champ qui casse
                * silencieusement un courriel transactionnel n'a rien a faire
                * dans un formulaire. Si le bloc doit changer un jour, cela se
                * decide dans le code, ou l'on voit les consequences. */}
              <div className="rounded-lg border border-ash bg-clinical p-3" data-testid="email-structure">
                <p className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mb-1.5">
                  {L("Structure du message", "Message structure")}
                </p>
                <p className="text-xs text-glacier leading-relaxed">
                  {L("Le courriel s'assemble dans cet ordre : titre, intro, bloc automatique, corps, outro, bouton d'action.",
                     "The email is assembled in this order: heading, intro, automatic block, body, outro, action button.")}
                </p>
                <p className="text-xs text-glacier leading-relaxed mt-1.5">
                  {form._block === "none"
                    ? L("Bloc automatique : aucun.", "Automatic block: none.")
                    : L(`Bloc automatique : « ${form._block} » — ${BLOCS[form._block]?.fr || "contenu généré à l'envoi"}. Il se règle dans le code, pas ici : le retirer d'un courriel transactionnel en supprimerait l'essentiel.`,
                        `Automatic block: "${form._block}" — ${BLOCS[form._block]?.en || "content generated at send time"}. It is set in code, not here: removing it from a transactional email would strip its substance.`)}
                </p>
              </div>

              {/* Aide-mémoire variables */}
              {form._variables?.length > 0 && (
                <div className="rounded-lg border border-ash bg-clinical p-3">
                  <p className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mb-2"
                    data-testid="email-var-cible">
                    {L(`Variables disponibles — insérées dans : ${cibleInsertion}`,
                       `Available variables — inserted into: ${cibleInsertion}`)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {form._variables.map((v) => (
                      <button key={v} onClick={() => insertVar(cibleInsertion, v)}
                        data-testid={`email-var-${jetonVariable(v).replace(/[{}]/g, "")}`}
                        className="px-2 py-1 rounded bg-white border border-ash font-data text-[11px] hover:border-nova transition">
                        {jetonVariable(v)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* FR */}
              <div className="rounded-xl border border-ash bg-white p-4">
                <div className="font-data text-[10px] uppercase tracking-[0.2em] text-nova mb-3">Français</div>
                <LabeledInput label={L("Sujet", "Subject")} value={form.subject_fr} onChange={(v) => setForm({ ...form, subject_fr: v })}
                  onFocus={() => setChampActif("subject_fr")} testId="email-subject-fr" />
                <LabeledInput label={L("Titre", "Heading")} value={form.heading_fr} onChange={(v) => setForm({ ...form, heading_fr: v })}
                  onFocus={() => setChampActif("heading_fr")} testId="email-heading-fr" />
                <LabeledTextarea label={L("Intro (avant le bloc automatique)", "Intro (before the automatic block)")} value={form.intro_fr} onChange={(v) => setForm({ ...form, intro_fr: v })}
                  onFocus={() => setChampActif("intro_fr")} testId="email-intro-fr" />
                <LabeledTextarea label={L("Corps (HTML permis)", "Body (HTML allowed)")} value={form.body_fr} onChange={(v) => setForm({ ...form, body_fr: v })}
                  onFocus={() => setChampActif("body_fr")} testId="email-body-fr" />
                <LabeledTextarea label={L("Outro (dernier mot)", "Outro (closing words)")} value={form.outro_fr} onChange={(v) => setForm({ ...form, outro_fr: v })}
                  onFocus={() => setChampActif("outro_fr")} testId="email-outro-fr" />
              </div>

              {/* EN */}
              <div className="rounded-xl border border-ash bg-white p-4">
                <div className="font-data text-[10px] uppercase tracking-[0.2em] text-nova mb-3">English</div>
                <LabeledInput label="Subject" value={form.subject_en} onChange={(v) => setForm({ ...form, subject_en: v })}
                  onFocus={() => setChampActif("subject_en")} testId="email-subject-en" />
                <LabeledInput label="Heading" value={form.heading_en} onChange={(v) => setForm({ ...form, heading_en: v })}
                  onFocus={() => setChampActif("heading_en")} testId="email-heading-en" />
                <LabeledTextarea label="Intro (before the automatic block)" value={form.intro_en} onChange={(v) => setForm({ ...form, intro_en: v })}
                  onFocus={() => setChampActif("intro_en")} testId="email-intro-en" />
                <LabeledTextarea label="Body (HTML allowed)" value={form.body_en} onChange={(v) => setForm({ ...form, body_en: v })}
                  onFocus={() => setChampActif("body_en")} testId="email-body-en" />
                <LabeledTextarea label="Outro (closing words)" value={form.outro_en} onChange={(v) => setForm({ ...form, outro_en: v })}
                  onFocus={() => setChampActif("outro_en")} testId="email-outro-en" />
              </div>

              {/* CTA optionnel */}
              <div className="rounded-xl border border-ash bg-white p-4">
                <div className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mb-3">{L("Bouton d'action (optionnel)", "Action button (optional)")}</div>
                <LabeledInput label="URL" value={form.cta_url} onChange={(v) => setForm({ ...form, cta_url: v })} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <LabeledInput label={L("Libellé FR", "Label FR")} value={form.cta_label_fr} onChange={(v) => setForm({ ...form, cta_label_fr: v })} />
                  <LabeledInput label={L("Libellé EN", "Label EN")} value={form.cta_label_en} onChange={(v) => setForm({ ...form, cta_label_en: v })} />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={save} disabled={saving} data-testid="email-save"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-nordfjord text-white text-sm font-medium hover:bg-foreground/80 disabled:opacity-50 transition">
                  <Save size={15} /> {saving ? L("Enregistrement…", "Saving…") : L("Enregistrer", "Save")}
                </button>
                <button onClick={reset}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-ash text-sm hover:bg-clinical transition">
                  <RotateCcw size={14} /> {L("Réinitialiser", "Reset")}
                </button>
                <div className="flex-1" />
                <div className="inline-flex items-center gap-1 rounded-lg border border-ash p-0.5">
                  {["fr", "en"].map((lg) => (
                    <button key={lg} onClick={() => setPreviewLang(lg)}
                      className={`px-2.5 py-1 rounded text-xs font-medium ${previewLang === lg ? "bg-nordfjord text-white" : "text-glacier"}`}>
                      {lg.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button onClick={preview}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-nova text-nova text-sm hover:bg-nova/5 transition">
                  <Eye size={15} /> {L("Aperçu", "Preview")}
                </button>
              </div>

              {/* Aperçu */}
              {previewHtml && (
                <div className="rounded-xl border border-ash overflow-hidden">
                  <div className="bg-clinical px-4 py-2 border-b border-ash">
                    <span className="font-data text-[10px] uppercase tracking-wider text-glacier">{L("Sujet", "Subject")} :</span>{" "}
                    <span className="text-sm font-medium">{previewSubject}</span>
                  </div>
                  <iframe title="preview" srcDoc={previewHtml} className="w-full h-[520px] bg-white" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LabeledInput({ label, value, onChange, testId, onFocus }) {
  return (
    <label className="block mb-3">
      <span className="block font-data text-[10px] uppercase tracking-[0.2em] mb-1 text-glacier">{label}</span>
      <input value={value || ""} onChange={(e) => onChange(e.target.value)} data-testid={testId}
        onFocus={onFocus}
        className="w-full rounded-lg border border-ash px-3 py-2 text-sm outline-none focus:border-nova" />
    </label>
  );
}

function LabeledTextarea({ label, value, onChange, testId, onFocus }) {
  return (
    <label className="block mb-3 last:mb-0">
      <span className="block font-data text-[10px] uppercase tracking-[0.2em] mb-1 text-glacier">{label}</span>
      <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={4} data-testid={testId}
        onFocus={onFocus}
        className="w-full rounded-lg border border-ash px-3 py-2 text-sm font-data outline-none focus:border-nova resize-y" />
    </label>
  );
}
