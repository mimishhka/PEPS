import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { toast } from "sonner";
import api, { formatApiError } from "../../lib/api";
import { useLang } from "../../contexts/LanguageContext";

export default function Admin() {
  const { t } = useLang();
  const [stats, setStats] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);

  const loadAll = () => {
    api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
    api.get("/products").then((r) => setProducts(r.data)).catch(() => {});
    api.get("/admin/orders").then((r) => setOrders(r.data)).catch(() => {});
    api.get("/admin/customers").then((r) => setCustomers(r.data)).catch(() => {});
  };
  useEffect(() => { loadAll(); }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12" data-testid="admin-page">
      <header className="border-b border-ink pb-6 mb-8">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// ADMIN CONSOLE</div>
        <h1 className="font-display text-5xl font-extrabold uppercase tracking-tight mt-2">{t("admin.title")}</h1>
      </header>

      {/* STATS */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 border-t border-l border-ink mb-12" data-testid="admin-stats">
          {[
            { k: t("admin.revenue"), v: `$${stats.revenue_cad.toFixed(2)}` },
            { k: t("admin.totalOrders"), v: stats.total_orders },
            { k: t("admin.pendingOrders"), v: stats.pending_orders },
            { k: t("admin.customersCount"), v: stats.customers },
            { k: t("admin.productsCount"), v: stats.products },
          ].map((s) => (
            <div key={s.k} className="border-r border-b border-ink p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">{s.k}</div>
              <div className="font-display text-3xl font-extrabold mt-2">{s.v}</div>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="orders">
        <TabsList className="bg-transparent border-b border-ink w-full justify-start rounded-none h-auto p-0 gap-0">
          {["orders", "products", "customers"].map((k) => (
            <TabsTrigger
              key={k}
              value={k}
              data-testid={`admin-tab-${k}`}
              className="font-mono text-xs uppercase tracking-[0.25em] rounded-none px-6 py-3 data-[state=active]:bg-ink data-[state=active]:text-white border-r border-ink"
            >
              {t(`admin.${k}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="orders" className="mt-6">
          <OrdersTable orders={orders} onChange={loadAll} />
        </TabsContent>
        <TabsContent value="products" className="mt-6">
          <ProductsManager products={products} onChange={loadAll} />
        </TabsContent>
        <TabsContent value="customers" className="mt-6">
          <CustomersTable customers={customers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrdersTable({ orders, onChange }) {
  const updateStatus = async (id, field, value) => {
    try {
      await api.put(`/admin/orders/${id}/status?${field}=${value}`);
      toast.success("Order updated");
      onChange();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };
  return (
    <div className="border border-ink overflow-x-auto" data-testid="admin-orders-table">
      <table className="w-full font-mono text-xs">
        <thead className="bg-ink text-white">
          <tr>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Order</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Date</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Email</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Method</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Payment</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Fulfillment</th>
            <th className="px-4 py-3 text-right uppercase tracking-[0.2em]">Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-ink/15" data-testid={`admin-order-${o.order_number}`}>
              <td className="px-4 py-3 font-bold">{o.order_number}</td>
              <td className="px-4 py-3 text-foreground/70">{new Date(o.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-3 text-foreground/70">{o.email || o.shipping_address?.full_name}</td>
              <td className="px-4 py-3 uppercase">{o.payment_method}</td>
              <td className="px-4 py-3">
                <select value={o.payment_status} onChange={(e) => updateStatus(o.id, "payment_status", e.target.value)} className="border border-ink px-2 py-1 bg-white">
                  <option>awaiting_etransfer</option>
                  <option>awaiting_crypto</option>
                  <option>paid</option>
                  <option>refunded</option>
                </select>
              </td>
              <td className="px-4 py-3">
                <select value={o.fulfillment_status} onChange={(e) => updateStatus(o.id, "fulfillment_status", e.target.value)} className="border border-ink px-2 py-1 bg-white">
                  <option>pending</option>
                  <option>processing</option>
                  <option>shipped</option>
                  <option>delivered</option>
                  <option>cancelled</option>
                </select>
              </td>
              <td className="px-4 py-3 text-right font-bold">${o.total.toFixed(2)}</td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-foreground/60">No orders yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CustomersTable({ customers }) {
  return (
    <div className="border border-ink overflow-x-auto" data-testid="admin-customers-table">
      <table className="w-full font-mono text-xs">
        <thead className="bg-ink text-white">
          <tr>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Name</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Email</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Role</th>
            <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Joined</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} className="border-t border-ink/15">
              <td className="px-4 py-3 font-bold">{c.name}</td>
              <td className="px-4 py-3">{c.email}</td>
              <td className="px-4 py-3 uppercase">{c.role}</td>
              <td className="px-4 py-3 text-foreground/70">{new Date(c.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductsManager({ products, onChange }) {
  const [editing, setEditing] = useState(null);
  const blank = {
    slug: "", name_en: "", name_fr: "", category: "healing", sequence: "",
    purity: "≥ 99%", dosage_mg: 5, description_en: "", description_fr: "",
    price_cad: 0, stock: 100, image_url: "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
    lab_tested: true, active: true,
  };

  const save = async () => {
    try {
      if (editing.id) await api.put(`/admin/products/${editing.id}`, editing);
      else await api.post("/admin/products", editing);
      toast.success("Saved");
      setEditing(null);
      onChange();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await api.delete(`/admin/products/${id}`);
    toast.success("Deleted");
    onChange();
  };

  return (
    <div data-testid="admin-products-manager">
      <button onClick={() => setEditing({ ...blank })} data-testid="admin-new-product" className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-5 py-3 mb-4">
        + New product
      </button>

      {editing && (
        <div className="border border-ink p-6 mb-6 space-y-3" data-testid="admin-product-editor">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Slug" value={editing.slug} onChange={(v) => setEditing({ ...editing, slug: v })} />
            <Field label="Category" value={editing.category} onChange={(v) => setEditing({ ...editing, category: v })} />
            <Field label="Name (EN)" value={editing.name_en} onChange={(v) => setEditing({ ...editing, name_en: v })} />
            <Field label="Name (FR)" value={editing.name_fr} onChange={(v) => setEditing({ ...editing, name_fr: v })} />
            <Field label="Sequence" value={editing.sequence} onChange={(v) => setEditing({ ...editing, sequence: v })} />
            <Field label="Purity" value={editing.purity} onChange={(v) => setEditing({ ...editing, purity: v })} />
            <Field label="Dosage mg" type="number" value={editing.dosage_mg} onChange={(v) => setEditing({ ...editing, dosage_mg: parseFloat(v) || 0 })} />
            <Field label="Price CAD" type="number" value={editing.price_cad} onChange={(v) => setEditing({ ...editing, price_cad: parseFloat(v) || 0 })} />
            <Field label="Stock" type="number" value={editing.stock} onChange={(v) => setEditing({ ...editing, stock: parseInt(v) || 0 })} />
            <Field label="Image URL" value={editing.image_url} onChange={(v) => setEditing({ ...editing, image_url: v })} />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">Description (EN)</label>
            <textarea value={editing.description_en} onChange={(e) => setEditing({ ...editing, description_en: e.target.value })} className="w-full border border-ink p-2 h-20" />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">Description (FR)</label>
            <textarea value={editing.description_fr} onChange={(e) => setEditing({ ...editing, description_fr: e.target.value })} className="w-full border border-ink p-2 h-20" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={save} data-testid="admin-product-save" className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-5 py-3">Save</button>
            <button onClick={() => setEditing(null)} className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-5 py-3">Cancel</button>
          </div>
        </div>
      )}

      <div className="border border-ink overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead className="bg-ink text-white">
            <tr>
              <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Slug</th>
              <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Name</th>
              <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Category</th>
              <th className="px-4 py-3 text-right uppercase tracking-[0.2em]">Price</th>
              <th className="px-4 py-3 text-right uppercase tracking-[0.2em]">Stock</th>
              <th className="px-4 py-3 text-right uppercase tracking-[0.2em]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-ink/15" data-testid={`admin-product-row-${p.slug}`}>
                <td className="px-4 py-3 font-bold">{p.slug}</td>
                <td className="px-4 py-3">{p.name_en}</td>
                <td className="px-4 py-3">{p.category}</td>
                <td className="px-4 py-3 text-right">${p.price_cad.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">{p.stock}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => setEditing({ ...p })} data-testid={`admin-edit-${p.slug}`} className="link-underline">Edit</button>
                  <button onClick={() => del(p.id)} data-testid={`admin-delete-${p.slug}`} className="link-underline text-signal" style={{ color: "#E51919" }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-ink px-2 py-2 bg-white" />
    </div>
  );
}
