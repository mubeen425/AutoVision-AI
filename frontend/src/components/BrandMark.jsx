/** Wowcar header logo — `frontend/public/assets/images/Inverse-Wow.png` */
const LOGO_SRC = "/assets/images/Inverse-Wow.png";

export default function BrandMark({ className = "" }) {
  return (
    <img
      src={LOGO_SRC}
      alt="PicoPost"
      width={280}
      height={72}
      decoding="async"
      fetchPriority="high"
      className={`h-9 w-auto max-h-11 sm:h-10 sm:max-h-12 max-w-[min(240px,52vw)] sm:max-w-[280px] object-contain object-left select-none ${className}`}
    />
  );
}
