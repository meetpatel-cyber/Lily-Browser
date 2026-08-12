import { useState } from "react";
import { Icon, type IconName } from "./Icon";

export function FaviconIcon({ url, fallback, filled = false, size = 16 }: { url: string; fallback: IconName; filled?: boolean; size?: number }) {
  const [error, setError] = useState(false);
  if (error) return <Icon name={fallback} size={size} filled={filled} />;
  try {
    const hostname = new URL(url).hostname;
    return <img src={`lily-favicon://${hostname}`} width={size} height={size} onError={() => setError(true)} style={{ objectFit: 'contain' }} alt="" />;
  } catch {
    return <Icon name={fallback} size={size} filled={filled} />;
  }
}
