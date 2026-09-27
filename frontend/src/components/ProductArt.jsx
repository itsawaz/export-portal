// Illustrated placeholders drawn in SVG, one per category, so the catalogue
// looks finished before real product photos are uploaded. When a product has
// an image_url, the photo is shown instead.
const FIBRE = '#f4ecda'
const EDGE = '#d9c7a3'
const SHADE = '#e8dcc0'

function Plate() {
  return (<g>
    <ellipse cx="100" cy="112" rx="70" ry="22" fill="#000" opacity=".06" />
    <ellipse cx="100" cy="100" rx="72" ry="30" fill={FIBRE} stroke={EDGE} strokeWidth="2" />
    <ellipse cx="100" cy="100" rx="52" ry="20" fill={SHADE} />
    <ellipse cx="100" cy="98" rx="50" ry="18" fill={FIBRE} />
  </g>)
}
function Compartment() {
  return (<g>
    <ellipse cx="100" cy="114" rx="74" ry="22" fill="#000" opacity=".06" />
    <ellipse cx="100" cy="100" rx="76" ry="32" fill={FIBRE} stroke={EDGE} strokeWidth="2" />
    <ellipse cx="100" cy="100" rx="62" ry="24" fill={SHADE} />
    <path d="M100 76 L100 100 M100 100 L52 112 M100 100 L150 110" stroke={EDGE} strokeWidth="5" strokeLinecap="round" />
  </g>)
}
function Clamshell() {
  return (<g>
    <ellipse cx="100" cy="140" rx="64" ry="12" fill="#000" opacity=".06" />
    <path d="M40 110 L160 110 L150 138 L50 138 Z" fill={FIBRE} stroke={EDGE} strokeWidth="2" />
    <path d="M40 110 Q40 60 100 56 Q160 60 160 110 Z" fill={FIBRE} stroke={EDGE} strokeWidth="2" />
    <path d="M58 100 Q60 72 100 70 Q140 72 142 100" fill="none" stroke={SHADE} strokeWidth="6" />
    <rect x="92" y="106" width="16" height="10" rx="3" fill={SHADE} />
  </g>)
}
function Bowl() {
  return (<g>
    <ellipse cx="100" cy="144" rx="50" ry="10" fill="#000" opacity=".06" />
    <path d="M42 86 Q46 142 100 142 Q154 142 158 86 Z" fill={FIBRE} stroke={EDGE} strokeWidth="2" />
    <ellipse cx="100" cy="86" rx="58" ry="18" fill={SHADE} stroke={EDGE} strokeWidth="2" />
    <ellipse cx="100" cy="88" rx="46" ry="12" fill="#e1d2b2" />
  </g>)
}
function Container() {
  return (<g>
    <ellipse cx="100" cy="146" rx="66" ry="10" fill="#000" opacity=".06" />
    <path d="M38 92 L162 92 L152 142 L48 142 Z" fill={FIBRE} stroke={EDGE} strokeWidth="2" />
    <rect x="32" y="74" width="136" height="20" rx="6" fill={SHADE} stroke={EDGE} strokeWidth="2" />
    <rect x="48" y="66" width="104" height="10" rx="4" fill={FIBRE} stroke={EDGE} strokeWidth="2" />
  </g>)
}
function Cutlery() {
  return (<g fill={FIBRE} stroke={EDGE} strokeWidth="2">
    <ellipse cx="100" cy="152" rx="56" ry="8" fill="#000" opacity=".06" stroke="none" />
    <path d="M62 40 L62 70 Q62 80 70 82 L70 146 L78 146 L78 82 Q86 80 86 70 L86 40 L82 40 L82 66 L78 66 L78 40 L74 40 L74 66 L70 66 L70 40 Z" />
    <ellipse cx="108" cy="60" rx="12" ry="20" /><rect x="104" y="78" width="8" height="68" rx="3" />
    <path d="M134 40 Q148 60 146 96 L140 96 L140 146 L132 146 L132 40 Z" />
  </g>)
}
const ART = { plates: Plate, 'compartment-plates': Compartment, clamshells: Clamshell, bowls: Bowl, containers: Container, cutlery: Cutlery }

export default function ProductArt({ product, category, size = '70%' }) {
  if (product?.image_url) return <img src={product.image_url} alt={product.name} loading="lazy" />
  const Shape = ART[category || product?.category?.slug] || Plate
  return (
    <svg viewBox="0 0 200 180" style={{ width: size }} role="img" aria-label={product?.name || 'Product illustration'}>
      <circle cx="160" cy="36" r="10" fill="#9cb58f" opacity=".5" />
      <path d="M22 48 q14 -20 34 -14 q-6 20 -34 14z" fill="#8fae80" opacity=".55" />
      <Shape />
    </svg>
  )
}

export function BrandMark({ className = 'brand-mark' }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#2f5d3a" />
      <path d="M9 21c0-7 6-12 14-12-1 8-6 13-14 12z" fill="#f3ecdc" />
      <path d="M10 21c3-4 6-6 10-8" stroke="#2f5d3a" strokeWidth="1.3" fill="none" />
    </svg>
  )
}
