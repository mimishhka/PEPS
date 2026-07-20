export default function Compliance() {
  useDocumentHead({ title: "Compliance", description: "Fironova compliance and regulatory positioning. For Research Use Only. Not for human consumption.", path: "/compliance" });
  const { lang } = useLang();
  const isFr = lang === "fr";
  return (
    <div className="bg-clinical min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-16" data-testid="compliance-page">
        <header className="border-b border-ash pb-6">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-3">FIRONOVA</p>
          <h1 className="font-display text-[42px] sm:text-[52px] font-bold text-nordfjord tracking-[-0.01em]">
            {isFr ? "Conditions Générales" : "Terms & Conditions"}
          </h1>
          <p className="mt-4 text-sm text-glacier">
            {isFr
              ? "Dernière mise à jour : juin 2026 · Ces conditions s'appliquent à toute utilisation du
