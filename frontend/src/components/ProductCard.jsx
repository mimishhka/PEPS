import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../contexts/LanguageContext";
import { useCart } from "../contexts/CartContext";
import ProductImage from "./ProductImage";
import { prix } from "../lib/prix";
import { dosage } from "../lib/dosage";
import { estPrecommande } from "../lib/precommande";
import { useConfirm } from "./ConfirmDialog";

/* Une variante qu'on ne peut ni acheter ni precommander. La fiche produit
 * desactive exactement celles-la ; la carte en fait autant, pour que le meme
 * flacon ne soit pas selectionnable ici et grise la-bas. */
function indisponible(v) {
  if (!v) return true;
  if (v.badge_coming_soon && !v.preorder_enabled) return true;
  return Number(v.stock ?? 0) <= 0 && !v.preorder_enabled && !v.badge_coming_soon;
}

export default function ProductCard({ product, index = 0 }) {
  const { lang } = useLang();
  const { add } = useCart();
  const confirm = useConfirm();
  const name = lang === "fr" ? product.name_fr : product.name_en;

  const variants = useMemo(() => product.variants || [], [product.variants]);
  const priced = useMemo(() => variants.map((v) => {
    const isPre = estPrecommande(v, 1);
    const sale = v.sale_price && v.sale_price < v.price;
    const eff = isPre && v.preorder_price ? v.preorder_price : sale ? v.sale_price : v.price;
    return { ...v, eff, isPre, sale };
  }), [variants]);

  /* LE DOSAGE SE CHOISIT SUR LA CARTE, ET LE PRIX SUIT.
   *
   * MIREILLE, 11/10/2026 : « add this buttons without prices on the catalog
   * on the product tile », puis « change the price according to the
   * selection of dosage ».
   *
   * La carte annoncait jusqu'ici le prix de la variante la MOINS CHERE, suivi
   * de « dès ». Pour acheter le 10 mg il fallait ouvrir la fiche. Elle porte
   * maintenant le meme selecteur que la fiche — sans les prix, qui seraient
   * redondants puisque le prix affiche est celui du dosage choisi — et le
   * bouton ajoute ce dosage-la.
   *
   * Le defaut tombe sur la moins chere DISPONIBLE, et non sur la moins chere
   * tout court : ouvrir le catalogue sur une pastille grisee, avec un bouton
   * « Rupture » juste dessous, serait un mauvais premier regard alors qu'un
   * autre dosage est en tablette.
   */
  const parDefaut = useMemo(() => {
    const candidats = priced.filter((v) => !indisponible(v));
    const liste = candidats.length ? candidats : priced;
    return liste.length ? liste.reduce((m, v) => (v.eff < m.eff ? v : m), liste[0]).id : null;
  }, [priced]);

  const [choisiId, setChoisiId] = useState(null);
  const choisie = priced.find((v) => v.id === (choisiId ?? parDefaut))
    || priced.find((v) => v.id === parDefaut)
    || priced[0]
    || null;

  const displayPrice = choisie ? choisie.eff : product.price_cad;
  const displayOriginal = choisie && choisie.eff < choisie.price ? choisie.price : null;

  /* UNE PRECOMMANDE NE S'AJOUTE PAS EN SILENCE.
   *
   * MIREILLE, 30/09/2026 : « je constate que lors de l'ajout d'un produit en
   * precommande il n'y a pas de notification pour le client ».
   *
   * La fiche produit ouvrait bien une confirmation ; cette carte, non. Elle
   * appelait `add()` directement, sous un bouton qui disait « Ajouter a la
   * commande » exactement comme pour un article en stock. Le client repartait
   * avec une precommande au panier sans l'avoir su, et rien ne le lui disait
   * ensuite — ni le panier, ni la caisse, ni le courriel.
   *
   * On reprend la meme confirmation que la fiche produit, avec le delai
   * annonce. La pastille « Precommande » de la carte ne suffisait pas : elle
   * informe celui qui la cherche, pas celui qui clique.
   *
   * Le test porte sur la variante CHOISIE et non sur « une variante
   * quelconque » : c'est celle-la que le bouton ajoute. Une carte dont une
   * variante est en stock et une autre en precommande annoncerait « En
   * stock » tout en ajoutant la precommande.
   */
  const ajoutEstUnePrecommande = !!choisie?.isPre;

  const ajouter = async () => {
    if (!ajoutEstUnePrecommande) {
      add(product, 1, choisie);
      return;
    }
    const delai = choisie?.preorder_delay_message
      ? ` ${lang === "fr" ? "Délai annoncé" : "Announced delay"} : ${choisie.preorder_delay_message}.`
      : "";
    if (await confirm({
      title: lang === "fr" ? "Précommander ce produit ?" : "Pre-order this product?",
      description: lang === "fr"
        ? `Ce produit n'est pas en stock : il partira à l'arrivée du prochain lot.${delai} Si votre commande contient aussi des articles disponibles, ceux-ci vous seront expédiés tout de suite, sans frais de livraison supplémentaires.`
        : `This product is out of stock : it ships when the next batch arrives.${delai} If your order also contains available items, those ship right away, at no extra shipping cost.`,
      confirmLabel: lang === "fr" ? "Précommander" : "Pre-order",
    })) {
      add(product, 1, choisie);
    }
  };

  const stockN = choisie ? (choisie.stock ?? 0) : (product.stock ?? 0);
  const inStock = stockN > 0;
  /* E2E CA-007 : le bouton restait actif quand tout est a zero sans
   * precommande. Il regarde desormais la variante CHOISIE : c'est elle qu'il
   * ajoute, donc c'est sa disponibilite a elle qui decide. Les autres dosages
   * restent atteignables par leur pastille. */
  const achetable = !!choisie && !indisponible(choisie);
  /* LE STOCK NE SE CHIFFRE PLUS, ET « BAS » NE SE DIT PLUS.
   *
   * MIREILLE, 11/10/2026 : « never mention low stock and the amount in
   * stock ».
   *
   * La carte annoncait « Stock bas · 10 » des que le compte passait sous le
   * seuil de la fiche (E2E CA-008). Ca disait deux choses qu'une boutique n'a
   * pas a dire : combien il lui reste, et qu'elle est a court. La premiere
   * est une information d'inventaire ; la seconde presse la cliente sans
   * qu'elle l'ait demande.
   *
   * Il ne reste que le fait : en stock, ou non. Le seuil `low_stock_threshold`
   * garde tout son role cote OPS, ou il sert a reapprovisionner. */

  return (
    <div
      className="group flex flex-col card-hover" data-testid-carte=""
      data-testid={`product-card-${product.slug}`}
    >
      <Link to={`/product/${product.slug}`} className="block relative aspect-square overflow-hidden bg-white" style={{ borderRadius: "var(--r-m)" }}>
        <ProductImage
          src={product.image_url}
          slug={product.slug}
          alt={name}
          width={800}
          height={600}
          loading="lazy"
          className="w-full h-full"
          imgClassName="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </Link>

      {/* TROIS LIGNES SONT PARTIES DE LA CARTE le 11/10/2026, a sa demande.
          « USAGE RECHERCHE UNIQUEMENT » se lisait douze fois sur une grille de
          douze produits, alors que le bandeau de l'en-tete le dit deja sur
          chaque page et que la fiche le repete. L'audit du 06/10 le demandait
          aussi : « Réduire FOR RESEARCH USE ONLY aux 4 endroits utiles ».
          « 5 mg · Lyophilisé » redisait un dosage que les pastilles portent
          maintenant, et un mot identique sur tous les produits.
          « dès » n'a plus d'objet : le prix n'est plus un minimum, c'est celui
          du dosage choisi. */}
      <div className="pt-3 px-0.5 flex flex-col gap-1 sm:gap-1.5 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/product/${product.slug}`} className="font-display text-[13.5px] font-medium text-nordfjord hover:text-nova-texte transition-colors leading-snug">
            {name}
          </Link>
          {choisie?.sale && !choisie?.isPre && (
            <span className="etiquette font-semibold border border-nova text-nova-texte px-1.5 py-0.5" style={{ borderRadius: "var(--r-s)" }} data-testid={`sale-badge-${product.slug}`}>
              {lang === "fr" ? "PROMO" : "SALE"}
            </span>
          )}
          {ajoutEstUnePrecommande && (
            /* LE BADGE DECRIT LA VARIANTE QUE LE BOUTON AJOUTE, pas « une
               variante quelconque ».
               Audit du 06/10/2026, point 2 : « BPC-157 affiche à la fois le
               badge PRE-ORDER et • IN STOCK ». Les deux etaient vrais
               separement — le badge regardait « une variante quelconque », le
               statut regardait celle que le bouton ajoutait. Ensemble ils se
               contredisent, sur l'element le plus regarde de la carte.

               DEBORDEMENT A 360 px (rapport E2E NF-001) : « PRÉCOMMANDE » en
               chasse large ne peut pas se couper, et poussait la grille a
               408 px. La chasse se resserre sur mobile et le mot peut passer
               a la ligne plutot que d'elargir la carte. */
            /* L'EXCEPTION A L'ECHELLE, ECRITE PLUTOT QUE SUBIE.
               `etiquette` pose 0,2 em. Ici la chasse revient a 0,06 em
               jusqu'au premier palier, pour la raison dite juste au-dessus :
               sur 408 px le mot debordait la carte. L'echelle decide de la
               taille ; la largeur disponible garde son mot a dire.
               (Commentaire JS et non `{…}` : on est dans une expression entre
               parentheses, pas parmi des enfants JSX.) */
            <span className="etiquette font-semibold tracking-[0.06em] sm:tracking-[0.14em] border border-nova text-nova-texte px-1.5 py-0.5 break-words min-w-0" style={{ borderRadius: "var(--r-s)" }} data-testid={`preorder-badge-${product.slug}`}>
              {lang === "fr" ? "PRÉCOMMANDE" : "PRE-ORDER"}
            </span>
          )}
        </div>


        {priced.length > 0 && (
          /* LES PASTILLES NE PORTENT PAS LE PRIX, contrairement a celles de la
             fiche : le prix est juste en dessous, et il change avec la
             selection. L'ecrire deux fois ferait douter de l'un des deux.
             MIREILLE, 11/10/2026 : « the block for the dosage is too big ».
             Elles descendent de 44 a 36 px de haut et de 12 a 10 px de
             remplissage. C'est un ECART ASSUME avec le minimum de 44 px que
             l'audit demande pour les cibles tactiles : 36 px reste trois fois
             la hauteur du texte et tres au-dessus des 29 px que ce meme audit
             signalait, mais c'est sous le seuil d'Apple. A redire si un tap
             rate. */
          <div className="flex flex-wrap gap-1.5" data-testid={`card-dosages-${product.slug}`}>
            {priced.map((v) => {
              const actif = v.id === choisie?.id;
              const hors = indisponible(v);
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setChoisiId(v.id)}
                  disabled={hors}
                  aria-pressed={actif}
                  data-testid={`card-dosage-${product.slug}-${v.name}`}
                  className={`font-display text-[12px] font-semibold px-2.5 min-h-[36px] inline-flex items-center justify-center border transition-colors ${
                    actif ? "border-nova bg-nova/5 text-nordfjord" : "border-ash text-nordfjord hover:border-nova"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  style={{ borderRadius: "var(--r-m)" }}
                >
                  {dosage(v.name, lang)}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 mt-auto">
          <div className="flex items-baseline gap-2">
            {displayOriginal && (
              <span className="font-data text-sm line-through text-glacier" data-testid={`card-original-price-${product.slug}`}>
                {prix(displayOriginal, lang)}
              </span>
            )}
            <span className={`font-data text-[13.5px] font-medium tabular-nums ${displayOriginal ? "text-nova-texte" : "text-nordfjord"}`} data-testid={`card-price-${product.slug}`}>
              {prix(displayPrice ?? 0, lang)}
            </span>
          </div>
          {/* ET LE STATUT NE REPETE PAS LE BADGE.
              Audit, point 2 : « Tirzepatide : PRE-ORDER écrit 3 fois (badge,
              statut sur 2 lignes, bouton) ». Sur une precommande, le badge en
              haut et le bouton en bas le disent deja — ce troisieme libelle
              n'ajoutait rien et passait sur deux lignes (« PRE- / ORDER »).
              Il ne reste donc que pour ce qu'il est seul a dire : en stock,
              stock bas avec son compte, ou rupture. */}
          {!ajoutEstUnePrecommande && (
            <span className={`etiquette flex items-center gap-1.5 ${inStock ? "text-success-text" : "text-warning-text"}`}
                  data-testid={`card-stock-${product.slug}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${inStock ? "bg-success" : "bg-warning"}`} />
              {inStock
                ? (lang === "fr" ? "En stock" : "In stock")
                : (lang === "fr" ? "Rupture" : "Out")}
            </span>
          )}
        </div>
      </div>

      {/* LE BOUTON QUI RAPPORTE L'ARGENT PASSE AU PLANCHER TACTILE.
          Audit du 06/10/2026, section 1 : « Boutons ADD TO ORDER : 30 px de
          haut. Sous le minimum de 44–48 px. Ce sont les boutons qui
          rapportent de l'argent. »
          `btn-pill` fait bien 48 px (13 px de marge + 14 px sur 1,6) —
          c'est CETTE carte qui l'annulait avec `!py-1.5 !text-[11px]` pour
          gagner en densité. On garde la densité (le libellé reste petit) et
          on repose le plancher avec `min-h` : là où le libellé tient sur une
          ligne, le bouton fait 48 ; là où il passe à deux, il fait sa hauteur
          naturelle, déjà au-delà.
          Le remplissage horizontal descend de 22 à 12 px : sur une grille à
          deux colonnes à 360 px, le libellé ne disposait que de 108 px et se
          coupait en deux presque toujours. Il en a 128.

          MIREILLE, 11/10/2026 : « add to order too big (too much space and
          empty spaces) ». Le plancher passe de 48 à 44 px — le minimum
          d'Apple, qu'on garde ici parce que c'est LE bouton qui rapporte — et
          la gouttière au-dessus se resserre. */}
      <div className="pt-2 px-0.5">
        <button
          data-testid={`add-to-cart-${product.slug}`}
          onClick={ajouter}
          disabled={!achetable}
          className={`w-full btn-pill btn-nova !py-1.5 !px-3 !text-[11px] !tracking-[0.06em] min-h-[44px] ${!achetable ? "opacity-45 cursor-not-allowed" : ""}`}
        >
          {!achetable
            ? (lang === "fr" ? "Rupture" : "Out of stock")
            : ajoutEstUnePrecommande
              // Le bouton dit ce qu'il fait. « Ajouter a la commande » sur une
              // precommande laissait croire a une expedition immediate.
              ? (lang === "fr" ? "Précommander" : "Pre-order")
              : (lang === "fr" ? "Ajouter à la commande" : "Add to order")}
        </button>
      </div>
    </div>
  );
}
