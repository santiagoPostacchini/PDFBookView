import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps): IconProps => ({
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  ...props,
});

export const IconUpload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const IconChevronRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const IconFirst = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M17 5l-7 7 7 7M7 5v14" />
  </svg>
);

export const IconLast = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 5l7 7-7 7M17 5v14" />
  </svg>
);

export const IconZoomIn = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2M11 8.5v5M8.5 11h5" />
  </svg>
);

export const IconZoomOut = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2M8.5 11h5" />
  </svg>
);

export const IconReset = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4.5h4.5" />
  </svg>
);

export const IconPages = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="6" width="7.5" height="12" rx="1.2" />
    <rect x="13.5" y="6" width="7.5" height="12" rx="1.2" />
  </svg>
);

export const IconBook = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 6.5C9.5 5 6.5 4.6 3 5v13.5c3.5-.4 6.5 0 9 1.5 2.5-1.5 5.5-1.9 9-1.5V5c-3.5-.4-6.5 0-9 1.5z" />
    <path d="M12 6.5V20" />
  </svg>
);

export const IconAlert = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4l9 16H3l9-16z" />
    <path d="M12 10v4M12 17h.01" />
  </svg>
);

export const IconSheets = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 4h11a1 1 0 0 1 1 1v12" />
    <rect x="4" y="7" width="12" height="13" rx="1" />
    <path d="M10 7v13" />
  </svg>
);

export const IconSwap = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 9h14l-3.5-3.5M20 15H6l3.5 3.5" />
  </svg>
);

export const IconClear = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="5" width="16" height="14" rx="1.5" strokeDasharray="3 2.5" />
    <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
  </svg>
);

export const IconWand = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 19L15.5 8.5M13.5 6.5l4 4" />
    <path d="M18 3v3M16.5 4.5h3M6 5v2M5 6h2M19 15v2M18 16h2" />
  </svg>
);

export const IconClose = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconMinus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const IconCamera = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.4-2h5.8l1.4 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
