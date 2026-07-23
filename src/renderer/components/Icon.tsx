import type { ReactNode } from "react";

type IconName = "back" | "forward" | "reload" | "home" | "plus" | "close" | "search" | "globe" | "star" | "library" | "history" | "download" | "trash" | "folder" | "open";

const paths: Record<IconName, ReactNode> = {
  back: <path d="m15 18-6-6 6-6" />,
  forward: <path d="m9 18 6-6-6-6" />,
  reload: <path d="M20 11a8 8 0 1 0 2.3 5.7M20 4v7h-7" />,
  home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Zm6 11v-6h6v6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  search: <path d="m20 20-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />,
  globe: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-8-9h16M12 3c2.2 2.46 3.3 5.46 3.3 9S14.2 18.54 12 21c-2.2-2.46-3.3-5.46-3.3-9S9.8 5.46 12 3Z" />,
  star: <path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9Z" />,
  library: <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 19.5Zm0-1.5v16.5M8 7h8M8 11h8" />,
  history: <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5m4-4v7l4 2" />,
  download: <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 20h14" />,
  trash: <path d="M4 7h16m-10 4v6m4-6v6M9 7l1-3h4l1 3m-9 0 1 14h10l1-14" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  open: <path d="M14 4h6v6m0-6-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
};

export function Icon({ name, size = 18, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
