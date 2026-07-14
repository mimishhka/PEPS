import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";

const statusColor = {
  awaiting_etransfer: "bg-secondary",
  awaiting_crypto: "bg-secondary",
  paid: "bg-ink text-white",
  shipped: "bg-warning",
  delivered: "bg-ink text-white",
  pending: "bg-secondary",
};

export default function Account() {
  useDocumentHead({ title: "My Account", path: "/account", noindex: true });
  const { user, logout } = useAuth();
  const { t } = useLang();
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    api.get("/orders/mine").then((r) => setOrders(r.data)).catch(() => setOrders([]));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-16" data-testid="account-page">
      <div className="flex items-end justify-between border-b border-ink pb-6 mb-12">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// ACCOUNT</div>
          <h1 className="font-display text-5xl font-extrabold uppercase tracking-tight mt-2" data-testid="account-name">
            {user?.name}
          </h1>
          <p className="font-mono text-xs text-foreground/60 mt-1">{user?.email}</p>
        </div>
        <button onClick={logout} data-testid="account-logout" className="font-mono text-xs uppercase tracking-[0.25em] link-underline">
          {t("nav.logout")} →
        </button>
      </div>

      <h2 className="font-display text-2xl font-bold uppercase tracking-tight mb-6">{t("account.orders")}</h2>
      {orders.length === 0 ? (
        <div className="border border-ink p-8 text-center" data-testid="account-no-orders">
          <p className="text-foreground/70">{t("account.noOrders")}</p>
          <Link to="/catalog" className="inline-block mt-4 bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3">
            {t("nav.catalog")} →
          </Link>
        </div>
      ) : (
        <div className="border border-ink overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead className="bg-ink text-white">
              <tr>
                <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">{t("account.orderNumber")}</th>
                <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">{t("account.date")}</th>
                <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">Items</th>
                <th className="px-4 py-3 text-left uppercase tracking-[0.2em]">{t("account.status")}</th>
                <th className="px-4 py-3 text-right uppercase tracking-[0.2em]">{t("account.total")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-ink/15 hover:bg-secondary" data-testid={`order-row-${o.order_number}`}>
                  <td className="px-4 py-4">
                    <Link to={`/order/${o.id}`} className="font-bold link-underline">{o.order_number}</Link>
                  </td>
                  <td className="px-4 py-4 text-foreground/70">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-4">{o.items.length}</td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 uppercase tracking-[0.15em] text-[10px] ${statusColor[o.payment_status] || "bg-secondary"}`}>
                      {o.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-bold">${o.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
