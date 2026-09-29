import type { CatalogProduct } from "@/lib/types";

const TEE =
  "M140 40 L100 52 L30 100 L58 170 L100 150 L100 410 L300 410 L300 150 L342 170 L370 100 L300 52 L260 40 C250 70 225 84 200 84 C175 84 150 70 140 40 Z";
const HOODIE =
  "M135 60 L95 72 L25 130 L50 200 L95 180 L95 415 L305 415 L305 180 L350 200 L375 130 L305 72 L265 60 C262 30 235 12 200 12 C165 12 138 30 135 60 Z";

export const MOCKUP_ASPECT = 440 / 400;

export function mockupSvg(product: CatalogProduct, printUrl?: string, withShadow = true) {
  const shade = product.dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const stroke = product.dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
  const shadow = withShadow ? `<ellipse cx="200" cy="425" rx="130" ry="10" fill="rgba(0,0,0,0.10)"/>` : "";
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440" width="400" height="440">`;

  if (product.kind === "mug") {
    return `${open}${shadow}
<path d="M300 170 C370 170 370 300 300 300" fill="none" stroke="#E6E6E3" stroke-width="26"/>
<rect x="70" y="110" width="240" height="280" rx="18" fill="${product.garmentHex}" stroke="${stroke}" stroke-width="2"/>
<ellipse cx="190" cy="112" rx="120" ry="12" fill="#EDEDEA"/>
${printUrl ? `<image href="${printUrl}" x="110" y="150" width="160" height="213" preserveAspectRatio="xMidYMid meet"/>` : ""}
</svg>`;
  }

  const hoodie = product.kind === "hoodie";
  const details = hoodie
    ? `<path d="M150 62 C160 100 240 100 250 62" fill="none" stroke="${stroke}" stroke-width="3"/>
<path d="M175 88 L172 140 M225 88 L228 140" stroke="${stroke}" stroke-width="3"/>
<path d="M140 330 L260 330 L270 395 L130 395 Z" fill="${shade}" stroke="${stroke}" stroke-width="2"/>`
    : `<path d="M140 40 C150 70 175 84 200 84 C225 84 250 70 260 40" fill="none" stroke="${stroke}" stroke-width="4"/>`;
  const art = printUrl
    ? `<image href="${printUrl}" x="${hoodie ? 132 : 118}" y="${hoodie ? 130 : 100}" width="${hoodie ? 136 : 164}" height="${hoodie ? 181 : 219}" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  return `${open}${shadow}
<path d="${hoodie ? HOODIE : TEE}" fill="${product.garmentHex}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>
${details}
<path d="M100 150 L100 410 M300 150 L300 410" stroke="${shade}" stroke-width="10"/>
${art}
</svg>`;
}

export function ProductMockup({ product, printUrl }: { product: CatalogProduct; printUrl?: string }) {
  return (
    <div
      className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: mockupSvg(product, printUrl) }}
    />
  );
}
