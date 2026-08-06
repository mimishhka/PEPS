import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Mail, Save, RotateCcw, Eye } from "lucide-react";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";

export default function AdminEmails() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

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

  useEffect(() => {
    load();
  }, [load]);

  const selectTemplate = (t) => {
    setSelected(t.key);
    setForm({
      subject_fr: t.subject_fr || "",
      subject_en: t.subject_en || "",
      heading_fr: t.heading_fr || "",
      heading_en: t.heading_en || "",
      body_fr: t.body_fr || "",
      body_en: t.body_en || "",
      cta_url: t.cta_url || "",
      cta_label_fr: t.cta_label_fr || "",
      cta_label_en: t.cta_label_en || "",
      _variables: t.variables || [],
      _label: t.label || t.key,
    });
    setPreviewHtml("");
    setPreviewSubject("");
  };

  const save = async () => {
    if (!selected || !form) return;
    setSaving(true);
    try {
      const { _variables, _label, ...payload } = form;
      await api.put(`/admin/email-templates/${selected}`, payload);
      toast.success(L("Email enregistre", "Email saved"));
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!selected) return;
    if (!window.confirm(L("Reinitialiser cet email au texte par defaut ?", "Reset this email to default text?"))) return;
    try {
      await api.post(`/admin/email-templates/${selected}/reset`);
      toast.success(L("Reinitialise", "Reset done"));
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
        <div className="font-data text-[11px] uppercase tracking-[0.24em] text-glacier">{L("SYSTEME", "SYSTEM")}</div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Mail size={26} /> {L("Emails", "Emails")}
        </h1>
      </div>

      {loading ? (
        <p className="text-sm text-glacier py-16 text-center">{L("Chargement...", "Loading...")}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          <div className="space-y-1">
            {templates.map((t) => (
              <button
                key={t.key}
                onClick={() => selectTemplate(t)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition ${
                  selected === t.key ? "bg-nordfjord text-white" : "hover:bg-clinical text-glacier"
                }`}
              >
                <div className="font-medium">{(t.label || t.key).split(" / ")[lang === "fr" ? 0 : 1] || t.label}</div>
              </button>
            ))}
          </div>

          {form && (
            <div className="space-y-5">
              {form._variables?.length > 0 && (
                <div className="rounded-lg border border-ash bg-clinical p-3">
                  <p className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mb-2">
                    {L("Variables disponibles", "Available variables")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {form._variables.map((v) => (
                      <button
                        key={v}
                        onClick={() => insertVar("body_fr", v)}
                        className="px-2 py-1 rounded bg-white border border-ash font-data text-[11px] hover:border-nova transition"
                      >
                        {`{${v}}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-ash bg-white p-4">
                <div className="font-data text-[10px] uppercase tracking-[0.2em] text-nova mb-3">Francais</div>
                <LabeledInput label={L("Sujet", "Subject")} value={form.subject_fr} onChange={(v) => setForm({ ...form, subject_fr: v })} />
                <LabeledInput label={L("Titre", "Heading")} value={form.heading_fr} onChange={(v) => setForm({ ...form, heading_fr: v })} />
                <LabeledTextarea label={L("Corps (HTML permis)", "Body (HTML allowed)")} value={form.body_fr} onChange={(v) => setForm({ ...form, body_fr: v })} />
              </div>

              <div className="rounded-xl border border-ash bg-white p-4">
                <div className="font-data text-[10px] uppercase tracking-[0.2em] text-nova mb-3">English</div>
                <LabeledInput label="Subject" value={form.subject_en} onChange={(v) => setForm({ ...form, subject_en: v })} />
                <LabeledInput label="Heading" value={form.heading_en} onChange={(v) => setForm({ ...form, heading_en: v })} />
                <LabeledTextarea label="Body (HTML allowed)" value={form.body_en} onChange={(v) => setForm({ ...form, body_en: v })} />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={save}
                  disabled={saving}
                  data-testid="email-save"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-nordfjord text-white text-sm font-medium hover:bg-nordfjord/80 disabled:opacity-50 transition"
                >
                  <Save size={15} /> {saving ? L("Enregistrement...", "Saving...") : L("Enregistrer", "Save")}
                </button>
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-ash text-sm hover:bg-clinical transition"
                >
                  <RotateCcw size={14} /> {L("Reinitialiser", "Reset")}
                </button>
                <div className="flex-1" />
                <div className="inline-flex items-center gap-1 rounded-lg border border-ash p-0.5">
                  {["fr", "en"].map((lg) => (
                    <button
                      key={lg}
                      onClick={() => setPreviewLang(lg)}
                      className={`px-2.5 py-1 rounded text-xs font-medium ${previewLang === lg ? "bg-nordfjord text-white" : "text-glacier"}`}
                    >
                      {lg.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button
                  onClick={preview}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-nova text-nova text-sm hover:bg-nova/5 transition"
                >
                  <Eye size={15} /> {L("Apercu", "Preview")}
                </button>
              </div>

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
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-ash px-3 py-2 text-sm outline-none focus:border-nova"
      />
    </label>
  );
}

function LabeledTextarea({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="block font-data text-[10px] uppercase tracking-[0.2em] mb-1 text-glacier">{label}</span>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full rounded-lg border border-ash px-3 py-2 text-sm font-data outline-none focus:border-nova resize-y"
      />
    </label>
  );
}
