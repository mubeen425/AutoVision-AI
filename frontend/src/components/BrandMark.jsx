/** Partner logo — path from /api/config */
import { useAppConfig } from "../context/AppConfigContext";

export default function BrandMark({ className = "" }) {
  const { config } = useAppConfig();
  const logoSrc = config.assets.logo;
  const alt = config.app.partnerName || "WowCar";

  return (
    <img
      src={logoSrc}
      alt={alt}
      width={280}
      height={72}
      decoding="async"
      fetchPriority="high"
      className={`h-7 min-[380px]:h-8 sm:h-12 w-auto max-h-9 min-[380px]:max-h-11 sm:max-h-14 md:h-15 md:max-h-18 max-w-[min(110px,30vw)] min-[380px]:max-w-[min(150px,38vw)] sm:max-w-[340px] object-contain object-left select-none ${className}`}
    />
  );
}
