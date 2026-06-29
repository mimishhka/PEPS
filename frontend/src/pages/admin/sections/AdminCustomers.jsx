import { useEffect, useState } from "react";
import api from "../../../lib/api";

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  useEffect(() => { api.get("/admin/customers").then((r) => setCustomers(r.data)); }, []);
  return (
    <div className="p-8" data-testid="admin-customers">
      <div className="mb-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// USERS</div>
        <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight mt-2">Customers</h1>
        <p className="font-mono text-xs text-foreground/60 mt-1">{customers.length} registered</p>
      </div>
      <div className="bg-white border border-ink/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-foreground/70">
            <tr>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Name</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Email</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Role</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Joined</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-ink/5" data-testid={`customer-${c.id}`}>
                <td className="px-6 py-3 font-bold">{c.name}</td>
                <td className="px-6 py-3 font-mono text-xs">{c.email}</td>
                <td className="px-6 py-3"><span className={`text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-0.5 ${c.role === "admin" ? "bg-ink text-white" : "bg-secondary"}`}>{c.role}</span></td>
                <td className="px-6 py-3 font-mono text-xs text-foreground/70">{(c.created_at || "").slice(0, 10)}</td>
              </tr>
            ))}
            {!customers.length && (
              <tr><td colSpan={4} className="px-6 py-12 text-center font-mono text-xs text-foreground/50">No customers yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
