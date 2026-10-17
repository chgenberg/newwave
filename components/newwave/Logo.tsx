export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="20" fill="#2B2D31" />
      <path d="M9 23.2c3.67-5.6 7.33-5.6 11 0s7.33 5.6 11 0" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M9 16.8c3.67-5.6 7.33-5.6 11 0s7.33 5.6 11 0" fill="none" stroke="#fff" strokeOpacity="0.38" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
