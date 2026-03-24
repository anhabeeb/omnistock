import type { SVGProps } from "react";

export interface AppIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function baseProps(size: number, props: AppIconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    width: size,
    height: size,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function DashboardIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

export function InventoryIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M4 7.5 12 3l8 4.5-8 4.5L4 7.5Z" />
      <path d="M4 7.5V16.5L12 21l8-4.5V7.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

export function DataIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
      <path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
    </svg>
  );
}

export function ReportsIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M5 20V8" />
      <path d="M12 20V4" />
      <path d="M19 20v-9" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function AdminIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M4 19c0-2.8 2.2-5 5-5s5 2.2 5 5" />
      <path d="M16 8h4" />
      <path d="M18 6v4" />
    </svg>
  );
}

export function ProfileIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20c1.8-3.4 4.1-5 7-5s5.2 1.6 7 5" />
    </svg>
  );
}

export function BellIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M6 10a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function MenuIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function CloseIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

export function CollapseIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="m10 7-5 5 5 5" />
      <path d="m14 7 5 5-5 5" />
    </svg>
  );
}

export function RefreshIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M20 11a8 8 0 1 0 2.2 5.5" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

export function LogoutIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function SunIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5" />
      <path d="M12 19.5V22" />
      <path d="m4.9 4.9 1.8 1.8" />
      <path d="m17.3 17.3 1.8 1.8" />
      <path d="M2 12h2.5" />
      <path d="M19.5 12H22" />
      <path d="m4.9 19.1 1.8-1.8" />
      <path d="m17.3 6.7 1.8-1.8" />
    </svg>
  );
}

export function MoonIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5Z" />
    </svg>
  );
}

export function CurrencyIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M12 3v18" />
      <path d="M17 7.5c0-2-2.2-3.5-5-3.5S7 5.3 7 7.5 9.2 11 12 11s5 1.5 5 3.5S14.8 18 12 18s-5-1.3-5-3.5" />
    </svg>
  );
}

export function PackageIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5Z" />
      <path d="M3 7.5v9L12 21l9-4.5v-9" />
      <path d="M12 12v9" />
    </svg>
  );
}

export function AlertIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M12 4 3.5 19h17L12 4Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function ClockIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function PlusIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function ActivityIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M3 12h4l2.5-5 5 10 2.5-5H21" />
    </svg>
  );
}

export function LocationIcon({ size = 20, ...props }: AppIconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
