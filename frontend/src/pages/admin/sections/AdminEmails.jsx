// frontend/src/pages/admin/sections/AdminEmails.jsx
// Section Système › Emails. Permet de modifier tous les emails transactionnels
// (sujet + corps, FR + EN), avec aide-mémoire des variables et aperçu en direct.
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Mail, Save, RotateCcw, Eye, Check, X } from "lucide-react";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";
import { useConfirm } from "../../../components/ConfirmDialog";

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
      body_fr: t.body_fr || "", body_en: t.body_en || "",
      cta_url: t.cta_url || "", cta_label_fr: t.cta_label_fr || "", cta_label_en: t.cta_label_en || "",
      _variables: t.variables || [], _label: t.label || t.key,
    });
    setPreviewHtml(""); setPreviewSubject("");
  };

  const save = async () => {
    if (!selected || !form) return;
    setSaving(true);
    try {
      const { _variables, _label, ...payload } = form;
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

  const insertVar = (field, variable) => {
    setForm((f) => ({ ...f, [field]: (f[field] || "") + `{${variable}}` }));
  };

  return (
    <div data-testid="admin-emails">
      <div className="mb-6">
        <div className="font-data text-[11px] uppercase tracking-[0.24em] text-glacier">{L("SYSTÈME", "SYSTEM")}</div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight flex items-center gap-2">
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
              {/* Aide-mémoire variables */}
              {form._variables?.length > 0 && (
                <div className="rounded-lg border border-ash bg-clinical p-3">
                  <p className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mb-2">
                    {L("Variables disponibles (cliquez pour insérer dans le corps FR)", "Available variables (click to insert into FR body)")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {form._variables.map((v) => (
                      <button key={v} onClick={() => insertVar("body_fr", v)}
                        className="px-2 py-1 rounded bg-white border border-ash font-data text-[11px] hover:border-nova transition">
                        {`{${v}}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* FR */}
              <div className="rounded-xl border border-ash bg-white p-4">
                <div className="font-data text-[10px] uppercase tracking-[0.2em] text-nova mb-3">Français</div>
                <LabeledInput label={L("Sujet", "Subject")} value={form.subject_fr} onChange={(v) => setForm({ ...form, subject_fr: v })} />
                <LabeledInput label={L("Titre", "Heading")} value={form.heading_fr} onChange={(v) => setForm({ ...form, heading_fr: v })} />
                <LabeledTextarea label={L("Corps (HTML permis)", "Body (HTML allowed)")} value={form.body_fr} onChange={(v) => setForm({ ...form, body_fr: v })} />
              </div>

              {/* EN */}
              <div className="rounded-xl border border-ash bg-white p-4">
                <div className="font-data text-[10px] uppercase tracking-[0.2em] text-nova mb-3">English</div>
                <LabeledInput label="Subject" value={form.subject_en} onChange={(v) => setForm({ ...form, subject_en: v })} />
                <LabeledInput label="Heading" value={form.heading_en} onChange={(v) => setForm({ ...form, heading_en: v })} />
                <LabeledTextarea label="Body (HTML allowed)" value={form.body_en} onChange={(v) => setForm({ ...form, body_en: v })} />
              </div>

              {/* CTA optionnel */}
              <div className="rounded-xl border border-ash bg-white p-4">
                <div className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mb-3">{L("Bouton d'action (optionnel)", "Action button (optional)")}</div>
                <LabeledInput label="URL" value={form.cta_url} onChange={(v) => setForm({ ...form, cta_url: v })} />
                <div className="grid grid-cols-2 gap-3">
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

function LabeledInput({ label, value, onChange }) {
  return (
    <label className="block mb-3">
      <span className="block font-data text-[10px] uppercase tracking-[0.2em] mb-1 text-glacier">{label}</span>
      <input value={value || ""} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-ash px-3 py-2 text-sm outline-none focus:border-nova" />
    </label>
  );
}

function LabeledTextarea({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="block font-data text-[10px] uppercase tracking-[0.2em] mb-1 text-glacier">{label}</span>
      <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={4}
        className="w-full rounded-lg border border-ash px-3 py-2 text-sm font-data outline-none focus:border-nova resize-y" />
    </label>
  );
}
