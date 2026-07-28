import { createContext, useContext, useEffect, useState, useMemo } from "react";
import api from "../lib/api";

const SiteConfigContext = createContext(null);

const DEFAULTS = {
  loaded: false,
  store: "FIRONOVA",
  currency: "CAD",
  shippingFlatCad: 20,
  provinces: [],
  minAge: 19,
  interacEmail: "",
  coaPageEnabled: false, // hidden by default until explicitly enabled server-side
  canadaPostEnabled: false,
  // Défaut sûr : si /meta échoue, la boutique reste OUVERTE. Un défaut à true
  // mettrait tout le site derrière la page d'attente au moindre hoquet réseau.
  prelaunchEnabled: false,
  launchCouponCode: "LAUNCH15",
  couponSectionEnabled: true, // coupon section shown by default
};

export function SiteConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/meta")
      .then((r) => {
        if (cancelled) return;
        setConfig({
          loaded: true,
          store: r.data.store,
          currency: r.data.currency,
          shippingFlatCad: r.data.shipping_flat_cad,
          provinces: r.data.provinces || [],
          minAge: r.data.min_age,
          interacEmail: r.data.interac_email,
          coaPageEnabled: !!r.data.coa_page_enabled,
          canadaPostEnabled: !!r.data.canada_post_enabled,
          prelaunchEnabled: !!r.data.prelaunch_enabled,
          launchCouponCode: r.data.launch_coupon_code || "LAUNCH15",
          couponSectionEnabled: r.data.coupon_section_enabled !== false,
        });
      })
      .catch(() => {
        // Network/API hiccup: keep safe defaults (COA page stays hidden).
        if (!cancelled) setConfig((c) => ({ ...c, loaded: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => config, [config]);
  return <SiteConfigContext.Provider value={value}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig() {
  const ctx = useContext(SiteConfigContext);
  if (!ctx) throw new Error("useSiteConfig must be used within SiteConfigProvider");
  return ctx;
}
