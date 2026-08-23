import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, X, Save, Ticket, Percent, DollarSign } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";
import { useConfirm } from "../../../components/ConfirmDialog";
import { useLang } from "../../../contexts/LanguageContext";
import { Th } from "../ui";

export default function AdminCoupons() {
  const confirm = useConfirm();
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

  const [coupons, setCoupons] = useState([]);
  const [editing, setEditing] = useState(null);
  // Codes d'affiliés : liste SÉPARÉE et en lecture seule. Ils partagent la
  // collection des coupons — le paiement n'a ainsi qu'un endroit où résoudre
  // un code — mais les mêler ici permettait d'en modifier la valeur ou de les
  // supprimer, ce qui coupait le rabais d'un partenaire sans prévenir personne.
  const [codesAffilies, setCodesAffilies] = useState([]);

  const load = () => api.get("/admin/coupons")
    .then((r) => setCoupons(r.data))
    .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    api.get("/admin/affiliate-codes")
      .then((r) => setCodesAffilies(Array.isArray(r.data) ? r.data : []))
      .catch(() => setCodesAffilies([]));
  }, []);

  const blank = {
    code: "", discount_type: "percent", value: 10, min_subtotal: 0,
    usage_limit: null, active: true, expires_at: null,
    start_at: null, allowed_emails: "", per_customer_limit: null,
    first_order_only: false, max_discount_cad: null,
    restrict_products: "", restrict_categories: "",
  };

  const shape = (c) => ({
    ...c,
    allowed_emails: (c.allowed_emails || []).join(", "),
    restrict_products: (c.restrict_products || []).join(", "),
    restrict_categories: (c.restrict_categories || []).join(", "),
  });

  const save = async () => {
    try {
      const payload = { ...editing };
      if (payload.usage_limit === "" || payload.usage_limit == null) payload.usage_limit = null;
      else payload.usage_limit = parseInt(payload.usage_limit);
      if (!payload.expires_at) payload.expires_at = null;
      if (!payload.start_at) payload.start_at = null;
      payload.value = parseFloat(payload.value);
      payload.min_subtotal = parseFloat(payload.min_subtotal) || 0;
      if (payload.per_customer_limit === "" || payload.per_customer_limit == null) payload.per_customer_limit = null;
      else payload.per_customer_limit = parseInt(payload.per_customer_limit);
      if (payload.max_discount_cad === "" || payload.max_discount_cad == null) payload.max_discount_cad = null;
      else payload.max_discount_cad = parseFloat(payload.max_discount_cad) || 0;
      payload.allowed_emails = String(payload.allowed_emails || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      payload.restrict_products = String(payload.restrict_products || "").split(",").map((s) => s.trim()).filter(Boolean);
      payload.restrict_categories = String(payload.restrict_categories || "").split(",").map((s) => s.trim()).filter(Boolean);
      payload.first_order_only = !!payload.first_order_only;
      if (editing.id) await api.put(`/admin/coupons/${editing.id}`, payload);
      else await api.post("/admin/coupons", payload);
      toast.success(L("Coupon enregistré", "Coupon saved"));
      setEditing(null);
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const del = async (id) => {
    if (!await confirm({ title: L("Supprimer ce coupon ?", "Delete this coupon?"), destructive: true })) return;
    await api.delete(`/admin/coupons/${id}`);
    toast.success(L("Supprimé", "Deleted"));
    load();
  };

  return (
    <div className="p-8" data-testid="admin-coupons">
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="font-data text-[11px] uppercase tracking-[0.24em] text-glacier">{L("PROMOTIONS", "PROMOTIONS")}</p>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-nordfjord mt-1">Coupons</h1>
          <p className="font-data text-xs text-glacier mt-1">
            {coupons.length} {L("code(s) actif(s)", "active code(s)")}
          </p>
        </div>
        <button
          onClick={() => setEditing(shape({ ...blank }))}
          data-testid="new-coupon-btn"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-nordfjord text-white text-sm font-medium hover:opacity-90 transition"
        >
          <Plus size={16} /> {L("Nouveau coupon", "New coupon")}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-ash rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>{L("Code", "Code")}</Th>
              <Th>{L("Rabais", "Discount")}</Th>
              <Th>{L("Sous-total min.", "Min subtotal")}</Th>
              <Th>{L("Utilisation", "Usage")}</Th>
              <Th>{L("Fenêtre", "Window")}</Th>
              <Th>{L("Actif", "Active")}</Th>
              <Th align="right"></Th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t border-ash/60" data-testid={`coupon-row-${c.code}`}>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2 text-nordfjord">
                    <Ticket size={14} className="text-nova" />
                    <span className="font-data font-bold">{c.code}</span>
                  </div>
                  {/* Un code d'affilié n'est PAS un coupon promotionnel.
                      Il vit dans la même table — le paiement n'interroge
                      qu'un seul endroit — mais le supprimer romprait le
                      rabais d'une personne réelle, sans la prévenir.
                      Le serveur refuse désormais cette suppression ; ce
                      marqueur évite d'aller jusqu'au refus. */}
                  {(c.affiliate_id || c.source === "affiliate") && (
                    <span className="inline-block text-[10px] font-data uppercase tracking-[0.12em] bg-nova/15 text-nova px-1.5 py-0.5 mt-1 rounded"
                          data-testid={`coupon-affiliate-${c.code}`}>
                      {L("CODE D'AFFILIÉ", "AFFILIATE CODE")}
                    </span>
                  )}
                  {(c.first_order_only || c.allowed_emails?.length || c.restrict_products?.length || c.restrict_categories?.length) && (
                    <span className="inline-block text-[10px] font-data uppercase tracking-[0.12em] bg-warning/15 text-warning px-1.5 py-0.5 mt-1 ml-1 rounded">
                      {L("RESTREINT", "RESTRICTED")}
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 font-data text-sm text-nordfjord">
                  {c.discount_type === "percent" ? `${c.value}%` : `$${c.value.toFixed(2)}`}
                </td>
                <td className="px-6 py-3 font-data text-xs text-glacier">${(c.min_subtotal || 0).toFixed(2)}</td>
                <td className="px-6 py-3 font-data text-xs text-glacier">
                  {c.used_count || 0}{c.usage_limit ? ` / ${c.usage_limit}` : " / ∞"}
                </td>
                <td className="px-6 py-3 font-data text-xs text-glacier">
                  {c.start_at || c.expires_at
                    ? `${(c.start_at || "").slice(0, 10) || "…"} → ${(c.expires_at || "").slice(0, 10) || "∞"}`
                    : "—"}
                </td>
                <td className="px-6 py-3">
                  {c.active
                    ? <span className="text-[10px] font-data uppercase tracking-[0.15em] bg-success/15 text-success px-2 py-0.5 rounded">ON</span>
                    : <span className="text-[10px] font-data uppercase tracking-[0.15em] bg-glacier/15 text-glacier px-2 py-0.5 rounded">OFF</span>}
                </td>
                <td className="px-6 py-3 text-right">
                  <button
                    onClick={() => setEditing(shape(c))}
                    data-testid={`edit-coupon-${c.code}`}
                    className="p-1.5 rounded-md border border-ash text-nordfjord hover:bg-clinical mr-1 transition"
                    title={L("Modifier", "Edit")}
                  >
                    <Edit size={13} />
                  </button>
                  <button
                    onClick={() => del(c.id)}
                    data-testid={`delete-coupon-${c.code}`}
                    className="p-1.5 rounded-md border border-ash text-error hover:bg-error hover:text-white hover:border-error transition"
                    title={L("Supprimer", "Delete")}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {!coupons.length && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center font-data text-xs text-glacier">
                  {L("Aucun coupon pour le moment", "No coupons yet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Codes d'affiliés — SÉPARÉS, et sans aucune action.
          Pas de bouton modifier, pas de bouton supprimer : ce n'est pas un
          oubli. Un code d'affilié se gère depuis sa fiche, seul endroit qui
          renomme le code ET archive l'ancien en alias, de sorte que les liens
          déjà distribués continuent de fonctionner. */}
      {codesAffilies.length > 0 && (
        <div className="mt-10" data-testid="affiliate-codes">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="font-display text-xl font-bold text-nordfjord">
              {L("Codes d'affiliés", "Affiliate codes")}
            </h2>
            <span className="font-data text-[10px] uppercase tracking-[0.2em] text-compliance border border-compliance rounded px-2 py-0.5">
              {L("consultation seule", "read only")}
            </span>
          </div>
          <p className="text-sm text-glacier mt-1 max-w-2xl">
            {L("Ces codes appartiennent à des affiliés. Ils se modifient depuis la fiche de l'affilié, qui renomme le code et conserve l'ancien en alias — les liens déjà distribués restent valides.",
               "These codes belong to affiliates. Change them from the affiliate's record, which renames the code and keeps the old one as an alias, so links already handed out keep working.")}
          </p>
          <div className="mt-4 bg-white border border-ash rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <Th>{L("Code", "Code")}</Th>
                    <Th>{L("Affilié", "Affiliate")}</Th>
                    <Th>{L("Rabais", "Discount")}</Th>
                    <Th>{L("Utilisations", "Uses")}</Th>
                    <Th>{L("Statut", "Status")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {codesAffilies.map((c) => (
                    <tr key={c.code} className="border-t border-ash">
                      <td className="px-4 py-3 font-data text-nordfjord">{c.code}</td>
                      <td className="px-4 py-3 text-nordfjord">
                        {c.affiliate_name || <span className="text-glacier">—</span>}
                        {c.affiliate_email && (
                          <span className="block font-data text-[11px] text-glacier">{c.affiliate_email}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-data tabular-nums">
                        {c.discount_type === "percent" ? `${c.value} %` : `${c.value} $`}
                      </td>
                      <td className="px-4 py-3 font-data tabular-nums">{c.used_count || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`font-data text-[10px] uppercase tracking-[0.15em] ${
                          c.affiliate_status === "active" ? "text-success" : "text-glacier"}`}>
                          {c.affiliate_status || (c.active ? L("actif", "active") : L("inactif", "inactive"))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Editor modal */}
      {editing && <CouponEditor L={L} editing={editing} setEditing={setEditing} save={save} />}
    </div>
  );
}

/* ---------- Editor Modal ---------- */

function CouponEditor({ L, editing, setEditing, save }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => setEditing(null)}
    >
      <div
        className="bg-white rounded-xl border border-ash w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="coupon-editor"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-ash px-6 py-4 flex items-center justify-between">
          <div>
            <p className="font-data text-[10px] uppercase tracking-[0.28em] text-nova">
              {editing.id ? L("MODIFIER", "EDIT") : L("NOUVEAU", "NEW")}
            </p>
            <h3 className="font-display text-xl font-bold text-nordfjord mt-0.5">
              {editing.id ? L("Modifier le coupon", "Edit coupon") : L("Nouveau coupon", "New coupon")}
            </h3>
          </div>
          <button onClick={() => setEditing(null)} className="p-1 rounded-md hover:bg-clinical" data-testid="coupon-editor-close">
            <X size={18} className="text-glacier" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Section: Basics */}
          <Section title={L("Général", "Basics")}>
            <F
              label={L("Code (majuscules)", "Code (uppercase)")}
              value={editing.code}
              onChange={(v) => setEditing({ ...editing, code: v.toUpperCase() })}
              test="c-code"
              placeholder="SUMMER20"
              mono
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F
                label={L("Type de rabais", "Discount type")}
                select={[
                  { value: "percent", label: L("Pourcentage (%)", "Percent (%)") },
                  { value: "fixed", label: L("Montant fixe (CAD)", "Fixed amount (CAD)") },
                ]}
                value={editing.discount_type}
                onChange={(v) => setEditing({ ...editing, discount_type: v })}
                test="c-type"
              />
              <F
                label={editing.discount_type === "percent" ? L("Pourcentage (%)", "Percent (%)") : L("Montant (CAD)", "Amount (CAD)")}
                type="number"
                value={editing.value}
                onChange={(v) => setEditing({ ...editing, value: v })}
                test="c-value"
                icon={editing.discount_type === "percent" ? <Percent size={14} /> : <DollarSign size={14} />}
              />
            </div>
            <F
              label={L("Sous-total minimum (CAD)", "Minimum subtotal (CAD)")}
              type="number"
              value={editing.min_subtotal}
              onChange={(v) => setEditing({ ...editing, min_subtotal: v })}
              test="c-min"
              icon={<DollarSign size={14} />}
            />
            <label className="flex items-center gap-2 text-sm text-nordfjord cursor-pointer">
              <input
                type="checkbox"
                checked={!!editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                data-testid="c-active"
                className="w-4 h-4 accent-nova"
              />
              {L("Coupon actif", "Coupon active")}
            </label>
          </Section>

          {/* Section: Limits & schedule */}
          <Section title={L("Limites & calendrier", "Limits & schedule")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F
                label={L("Début (AAAA-MM-JJ)", "Starts at (YYYY-MM-DD)")}
                type="date"
                value={editing.start_at?.slice(0, 10) ?? ""}
                onChange={(v) => setEditing({ ...editing, start_at: v ? `${v}T00:00:00+00:00` : null })}
                test="c-start"
              />
              <F
                label={L("Expiration (AAAA-MM-JJ)", "Expires at (YYYY-MM-DD)")}
                type="date"
                value={editing.expires_at?.slice(0, 10) ?? ""}
                onChange={(v) => setEditing({ ...editing, expires_at: v ? `${v}T23:59:59+00:00` : null })}
                test="c-expires"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F
                label={L("Limite totale (vide = illimité)", "Total limit (blank = ∞)")}
                type="number"
                value={editing.usage_limit ?? ""}
                onChange={(v) => setEditing({ ...editing, usage_limit: v })}
                test="c-limit"
                placeholder="∞"
              />
              <F
                label={L("Par client (vide = ∞)", "Per customer (blank = ∞)")}
                type="number"
                value={editing.per_customer_limit ?? ""}
                onChange={(v) => setEditing({ ...editing, per_customer_limit: v })}
                test="c-per-customer"
                placeholder="∞"
              />
            </div>
            <F
              label={L("Rabais max. (CAD, vide = aucun)", "Max discount (CAD, blank = none)")}
              type="number"
              value={editing.max_discount_cad ?? ""}
              onChange={(v) => setEditing({ ...editing, max_discount_cad: v })}
              test="c-max-discount"
              icon={<DollarSign size={14} />}
            />
            <label className="flex items-center gap-2 text-sm text-nordfjord cursor-pointer">
              <input
                type="checkbox"
                checked={!!editing.first_order_only}
                onChange={(e) => setEditing({ ...editing, first_order_only: e.target.checked })}
                data-testid="c-first-order"
                className="w-4 h-4 accent-nova"
              />
              {L("Première commande seulement", "First order only")}
            </label>
          </Section>

          {/* Section: Targeting */}
          <Section title={L("Ciblage (optionnel)", "Targeting (optional)")}>
            <F
              label={L("Courriels autorisés (séparés par des virgules)", "Allowed emails (comma-separated)")}
              value={editing.allowed_emails}
              onChange={(v) => setEditing({ ...editing, allowed_emails: v })}
              test="c-emails"
              placeholder={L("vide = tout le monde", "blank = everyone")}
            />
            <F
              label={L("IDs produits restreints (séparés par des virgules)", "Restricted product IDs (comma-separated)")}
              value={editing.restrict_products}
              onChange={(v) => setEditing({ ...editing, restrict_products: v })}
              test="c-products"
              placeholder={L("vide = tous", "blank = all")}
            />
            <F
              label={L("Catégories restreintes (séparées par des virgules)", "Restricted categories (comma-separated)")}
              value={editing.restrict_categories}
              onChange={(v) => setEditing({ ...editing, restrict_categories: v })}
              test="c-categories"
              placeholder={L("vide = toutes", "blank = all")}
            />
          </Section>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 bg-white border-t border-ash px-6 py-4 flex gap-2 justify-end">
          <button
            onClick={() => setEditing(null)}
            className="px-4 py-2 rounded-lg border border-ash text-sm font-medium text-nordfjord hover:bg-clinical transition"
          >
            {L("Annuler", "Cancel")}
          </button>
          <button
            onClick={save}
            data-testid="save-coupon-btn"
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-nordfjord text-white text-sm font-medium hover:opacity-90 transition"
          >
            <Save size={14} /> {L("Enregistrer", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-ash bg-clinical/40 p-4 space-y-3">
      <p className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">{title}</p>
      {children}
    </div>
  );
}

function F({ label, value, onChange, type = "text", select, test, placeholder, mono, icon }) {
  const inputCls =
    "w-full rounded-lg border border-ash bg-white px-3 py-2 text-sm text-nordfjord outline-none focus:border-nova transition" +
    (mono ? " font-data" : "") +
    (icon ? " pl-8" : "");
  return (
    <div>
      <label className="block font-data text-[10px] uppercase tracking-[0.2em] mb-1 text-glacier">{label}</label>
      {select ? (
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          data-testid={test}
          className="w-full rounded-lg border border-ash bg-white px-3 py-2 text-sm text-nordfjord outline-none focus:border-nova transition"
        >
          {select.map((s) => {
            const opt = typeof s === "string" ? { value: s, label: s } : s;
            return <option key={opt.value} value={opt.value}>{opt.label}</option>;
          })}
        </select>
      ) : (
        <div className="relative">
          {icon && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-glacier">{icon}</span>}
          <input
            type={type}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            data-testid={test}
            placeholder={placeholder}
            className={inputCls}
          />
        </div>
      )}
    </div>
  );
}
