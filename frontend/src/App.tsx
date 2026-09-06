import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CreditCard, Link2, PackageCheck, ShieldCheck, ShoppingCart, UserRound } from "lucide-react";
import "./styles.css";

type Product = { sku: string; slug: string; name: string; price: number; stock: number; purity: string; lot: string; featured?: boolean };
type CartLine = Product & { quantity: number };
const products: Product[] = [
  { sku: "BPC-157-5MG", slug: "bpc-157", name: "BPC-157", price: 79, stock: 18, purity: "99.1%", lot: "PEPS-001", featured: true },
  { sku: "TB500-10MG", slug: "tb-500", name: "TB-500", price: 119, stock: 8, purity: "98.7%", lot: "PEPS-014", featured: true },
  { sku: "GHK-CU-50MG", slug: "ghk-cu", name: "GHK-Cu", price: 89, stock: 22, purity: "99.0%", lot: "PEPS-021" }
];
function money(value: number) { return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value); }
function App() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [ref, setRef] = useState("MARIE10");
  const [payment, setPayment] = useState("interac");
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const shipping = subtotal >= 200 || subtotal === 0 ? 0 : 20;
  const total = subtotal + shipping;
  const commission = useMemo(() => Math.round(subtotal * 0.1 * 100) / 100, [subtotal]);
  const add = (product: Product) => setCart((current) => {
    const existing = current.find((line) => line.sku === product.sku);
    if (existing) return current.map((line) => line.sku === product.sku ? { ...line, quantity: line.quantity + 1 } : line);
    return [...current, { ...product, quantity: 1 }];
  });
  return <main>
    <header className="topbar"><strong className="brand">PEPS</strong><nav><a>Catalog</a><a>Account</a><a>Affiliate</a><a>Admin</a></nav><button className="iconButton" aria-label="Cart"><ShoppingCart size={18}/>{cart.length}</button></header>
    <section className="hero"><div><p className="eyebrow">Research-use ecommerce</p><h1>Clean peptide catalog, checkout, affiliates, and admin operations.</h1><p className="lede">A rebuilt PEPS foundation with secure accounts, validated APIs, payment reconciliation, affiliate attribution, commission review, and responsive shopping workflows.</p><div className="actions"><button>Shop catalog</button><button className="secondary">View admin</button></div></div><div className="signalPanel"><ShieldCheck/><span>RUO / 19+ compliance visible across the buying flow</span><svg viewBox="0 0 420 120" role="img" aria-label="HPLC trace"><path d="M8 96 C70 96 82 93 96 84 L128 84 L145 26 L162 84 L214 84 L231 50 L247 84 L412 84"/></svg></div></section>
    <section className="grid"><div className="catalog"><h2>Product Catalog</h2><div className="products">{products.map((product) => <article className="card" key={product.sku}><p className="data">{product.lot} · {product.purity}</p><h3>{product.name}</h3><p>COA-backed product record with stock, lot, purity, SKU, and research-use warnings.</p><div className="row"><span className="price">{money(product.price)}</span><span>{product.stock} in stock</span></div><button onClick={() => add(product)}><ShoppingCart size={16}/> Add to cart</button></article>)}</div></div><aside className="checkout"><h2>Cart & Checkout</h2>{cart.length === 0 ? <p>No items yet.</p> : cart.map((line) => <div className="line" key={line.sku}><span>{line.name} x{line.quantity}</span><b>{money(line.price * line.quantity)}</b></div>)}<label>Affiliate code<input value={ref} onChange={(event) => setRef(event.target.value)}/></label><label>Payment provider<select value={payment} onChange={(event) => setPayment(event.target.value)}><option value="interac">Interac</option><option value="stripe">Card</option><option value="nowpayments">Crypto</option></select></label><div className="totals"><span>Subtotal</span><b>{money(subtotal)}</b><span>Shipping</span><b>{money(shipping)}</b><span>Total</span><b>{money(total)}</b></div><button disabled={!cart.length}><CreditCard size={16}/> Place order</button></aside></section>
    <section className="ops"><article><UserRound/><h3>Customer accounts</h3><p>Saved orders, addresses, secure cookie sessions, and role-safe access.</p></article><article><Link2/><h3>Affiliate tracking</h3><p>First-click attribution, links, click metadata, approved commissions, payout thresholds.</p><p className="data">Projected commission: {money(commission)}</p></article><article><PackageCheck/><h3>Admin dashboard</h3><p>Order/payment reconciliation, product inventory, refunds, failed checkout queue, payout review.</p></article></section>
    <footer>For Research Use Only. Not for human consumption. 19+ required.</footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
