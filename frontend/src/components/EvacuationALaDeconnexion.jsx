/* Une page personnelle ne reste pas à l'écran après une déconnexion.
 *
 * MIREILLE, 29/09/2026 : « lorsque je me déconnecte alors que je suis sur la
 * page des instructions de paiement, celle-ci reste là — cela n'a pas lieu
 * d'être ».
 *
 * La LISTE des pages concernées vit dans lib/deconnexion, avec ses tests : ce
 * sont les pages publiques qui affichent quelque chose de personnel, et que
 * rien n'évacuait faute de garde. Les routes protégées n'y figurent pas,
 * ProtectedRoute s'en occupe.
 *
 * On n'écoute que « fironova:session-cleared », qui ne part que de
 * purgeClientSession, appelée par logout(). La visite d'un invité ne
 * déclenche rien et n'est pas dérangée.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { doitQuitterALaDeconnexion } from "../lib/deconnexion";

export default function EvacuationALaDeconnexion() {
  const navigate = useNavigate();
  const location = useLocation();
  // La page courante lue par une référence, et non par une dépendance : sans
  // cela, l'écouteur serait détaché et rattaché à chaque navigation.
  const chemin = useRef(location.pathname);
  useEffect(() => { chemin.current = location.pathname; }, [location.pathname]);

  useEffect(() => {
    const surDeconnexion = () => {
      // `replace` et non `push` : sans lui, le bouton « précédent » ramènerait
      // sur la page qu'on vient justement de quitter, et la protection ne
      // tiendrait qu'un clic.
      if (doitQuitterALaDeconnexion(chemin.current)) navigate("/", { replace: true });
    };
    window.addEventListener("fironova:session-cleared", surDeconnexion);
    return () => window.removeEventListener("fironova:session-cleared", surDeconnexion);
  }, [navigate]);

  return null;
}
