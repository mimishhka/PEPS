import { useEffect, useRef } from "react";

/* ============================================================================
 * FIRONOVA — Brand primitives
 * Official identity: nordfjord #0B2E4F (structure) · nova #00B8D4 (spark/accent)
 * Display: Space Grotesk 700 · Data channel: JetBrains Mono
 * All marks are code-drawn and match the canonical logo-mark.svg geometry 1:1.
 * ==========================================================================*/

const NORDFJORD = "#0B2E4F";
const NOVA = "#00B8D4";

export function FnMark({ size = 40, frame = NORDFJORD, spark = NOVA, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g fill="none" stroke={frame} strokeWidth="4">
        <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" />
      </g>
      <g fill={frame}>
        <circle cx="50" cy="14" r="3" /><circle cx="50" cy="86" r="3" />
        <circle cx="84" cy="30" r="3" /><circle cx="16" cy="30" r="3" />
        <circle cx="84" cy="70" r="3" /><circle cx="16" cy="70" r="3" />
      </g>
      <g fill={spark}>
        <circle cx="50" cy="50" r="4.5" />
        <path d="M50 22 L54 46 L78 50 L54 54 L50 78 L46 54 L22 50 L46 46 Z" />
      </g>
    </svg>
  );
}

export function FnMarkMono({ size = 40, color = "#fff", className = "" }) {
  return <FnMark size={size} frame={color} spark={color} className={className} />;
}

export function NovaSpark({ size = 20, color = NOVA, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path fill={color} d="M50 8 L57 43 L92 50 L57 57 L50 92 L43 57 L8 50 L43 43 Z" />
    </svg>
  );
}

export function Wordmark({ size = 22, color = NORDFJORD }) {
  return (
    <span className="font-display font-bold" style={{ fontSize: size, letterSpacing: "0.14em", color }}>
      FIRONOVA
    </span>
  );
}

export function LogoHorizontal({ height = 40, mono, className = "" }) {
  const frame = mono === "white" ? "#fff" : NORDFJORD;
  const spark = mono === "white" ? "#fff" : NOVA;
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: height * 0.35 }}>
      <FnMark size={height} frame={frame} spark={spark} />
      <Wordmark size={height * 0.55} color={frame} />
    </span>
  );
}

export function MolecularMesh({ className = "", opacity = 0.5, animated = true }) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${animated ? "animate-mesh" : ""} ${className}`} style={{ opacity }} aria-hidden="true">
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
        <g stroke={NOVA} strokeWidth="1" fill="none" opacity="0.5">
          <line x1="120" y1="140" x2="340" y2="220"/><line x1="340" y1="220" x2="520" y2="120"/>
          <line x1="520" y1="120" x2="700" y2="260"/><line x1="700" y1="260" x2="940" y2="180"/>
          <line x1="940" y1="180" x2="1080" y2="340"/><line x1="340" y1="220" x2="420" y2="440"/>
          <line x1="420" y1="440" x2="220" y2="560"/><line x1="420" y1="440" x2="640" y2="520"/>
          <line x1="640" y1="520" x2="700" y2="260"/><line x1="640" y1="520" x2="880" y2="620"/>
          <line x1="880" y1="620" x2="1080" y2="340"/><line x1="880" y1="620" x2="1060" y2="700"/>
          <line x1="220" y1="560" x2="360" y2="700"/><line x1="360" y1="700" x2="640" y2="520"/>
        </g>
        <g fill={NOVA} opacity="0.7">
          <circle cx="120" cy="140" r="3" className="animate-node"/><circle cx="340" cy="220" r="4" className="animate-node" style={{animationDelay:".6s"}}/>
          <circle cx="520" cy="120" r="3" className="animate-node" style={{animationDelay:"1.1s"}}/><circle cx="700" cy="260" r="4" className="animate-node" style={{animationDelay:".3s"}}/>
          <circle cx="940" cy="180" r="3" className="animate-node" style={{animationDelay:"1.5s"}}/><circle cx="1080" cy="340" r="4" className="animate-node" style={{animationDelay:".9s"}}/>
          <circle cx="420" cy="440" r="4" className="animate-node" style={{animationDelay:"1.8s"}}/><circle cx="220" cy="560" r="3" className="animate-node" style={{animationDelay:".2s"}}/>
          <circle cx="640" cy="520" r="5" className="animate-node" style={{animationDelay:"1.3s"}}/><circle cx="880" cy="620" r="4" className="animate-node" style={{animationDelay:".7s"}}/>
          <circle cx="360" cy="700" r="3" className="animate-node" style={{animationDelay:"1.9s"}}/><circle cx="1060" cy="700" r="3" className="animate-node" style={{animationDelay:".4s"}}/>
        </g>
      </svg>
    </div>
  );
}

export function Seal({ size = 120 }) {
  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 100 100" width={size} height={size} className="animate-seal absolute inset-0">
        <defs><path id="seal-circle" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" /></defs>
        <text fill={NOVA} fontSize="8.2" letterSpacing="2.6" fontFamily="JetBrains Mono, monospace">
          <textPath href="#seal-circle">HPLC VERIFIED · 99% PURITY · FIRONOVA LABS ·</textPath>
        </text>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <FnMark size={size * 0.42} />
      </div>
    </div>
  );
}

export function VialArt({ hue, className = "" }) {
  return (
    <div className={`relative overflow-hidden flex items-center justify-center ${className}`}
      style={{ background: `linear-gradient(160deg, hsl(${hue},72%,16%), hsl(${hue},64%,28%))` }}>
      <svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full" style={{ opacity: .45 }}>
        <g stroke={NOVA} strokeWidth="1" fill="none" opacity=".7">
          <line x1="40" y1="50" x2="140" y2="90"/><line x1="140" y1="90" x2="240" y2="40"/>
          <line x1="240" y1="40" x2="320" y2="110"/><line x1="140" y1="90" x2="180" y2="150"/>
        </g>
        <g fill={NOVA}><circle cx="40" cy="50" r="3"/><circle cx="140" cy="90" r="4"/><circle cx="240" cy="40" r="3"/><circle cx="320" cy="110" r="3"/><circle cx="180" cy="150" r="3"/></g>
      </svg>
      <FnMark size={56} frame={NOVA} spark="#fff" className="relative z-10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-[30deg]" />
    </div>
  );
}

export function Reveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add("revealed"); obs.disconnect(); }
    }, { threshold: 0.12 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={`reveal ${className}`} style={{ animationDelay: `${delay}ms` }}>{children}</div>;
}
