// Recherche globale de l'administration — la loupe de la barre du haut.
//
// Elle répond à deux questions, les seules qu'on se pose en arrivant :
// « où est l'écran X ? » et « où est la commande de cette personne ? ».
// Les destinations viennent de la navigation elle-même : une entrée ajoutée
// au menu devient cherchable sans que personne n'ait à y penser.
//
// La recherche de commandes interroge le serveur, avec un délai de grâce :
// taper « marie » ne doit pas déclencher cinq requêtes.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ShoppingCart } from "lucide-react";
import api from "../../lib/api";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "../../components/ui/command";

const DELAI_MS = 250;

export function PaletteRecherche({ ouvert, setOuvert, groupes, L, lang }) {
  const navigate = useNavigate();
  const [terme, setTerme] = useState("");
  const [commandes, setCommandes] = useState([]);
  const dernier = useRef(0);

  // Les commandes ne se cherchent qu'à partir de deux caractères : en dessous,
  // la réponse serait la liste entière, ce qui n'aide personne.
  useEffect(() => {
    const q = terme.trim();
    if (!ouvert || q.length < 2) { setCommandes([]); return undefined; }
    const jeton = ++dernier.current;
    const t = setTimeout(() => {
      api.get(`/admin/orders/page?limit=5&query=${encodeURIComponent(q)}`)
        .then((r) => {
          // Une réponse arrivée après une frappe plus récente est périmée :
          // l'afficher ferait clignoter d'anciens résultats.
          if (jeton === dernier.current) setCommandes(r.data?.items || []);
        })
        .catch(() => { if (jeton === dernier.current) setCommandes([]); });
    }, DELAI_MS);
    return () => clearTimeout(t);
  }, [terme, ouvert]);

  useEffect(() => { if (!ouvert) { setTerme(""); setCommandes([]); } }, [ouvert]);

  const aller = (chemin) => { setOuvert(false); navigate(chemin); };

  const destinations = useMemo(
    () => (groupes || []).map((g) => ({
      id: g.id, label: g.label,
      items: (g.items || []).map((n) => ({ to: n.to, label: n.label, icon: n.icon })),
    })),
    [groupes]
  );

  return (
    <CommandDialog open={ouvert} onOpenChange={setOuvert}>
      <CommandInput
        value={terme}
        onValueChange={setTerme}
        data-testid="palette-input"
        placeholder={L("Rechercher un écran, une commande, un client…",
                       "Search a screen, an order, a customer…")}
      />
      <CommandList>
        <CommandEmpty>{L("Aucun résultat.", "No result.")}</CommandEmpty>

        {commandes.length > 0 && (
          <CommandGroup heading={L("Commandes", "Orders")}>
            {commandes.map((o) => (
              <CommandItem key={o.id} value={`${o.order_number} ${o.email}`}
                onSelect={() => aller(`orders/${o.id}`)}
                data-testid={`palette-order-${o.order_number}`}>
                <ShoppingCart size={15} className="mr-2 text-glacier" />
                <span className="font-data font-semibold">{o.order_number}</span>
                <span className="ml-2 truncate text-glacier">
                  {o.shipping_address?.full_name || o.email}
                </span>
                <span className="ml-auto tabular-nums text-glacier">
                  {Number(o.total || 0).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA",
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {destinations.map((g) => (
          <CommandGroup key={g.id} heading={g.label}>
            {g.items.map((n) => (
              <CommandItem key={n.to} value={`${n.label} ${g.label}`}
                onSelect={() => aller(n.to)}
                data-testid={`palette-nav-${n.label.toLowerCase()}`}>
                {n.icon ? <n.icon size={15} className="mr-2 text-glacier" /> : <Search size={15} className="mr-2" />}
                {n.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

export default PaletteRecherche;
