import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const base = (props: P) => ({
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

export const IconHome = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
)

export const IconDumbbell = (p: P) => (
  <svg {...base(p)}>
    <path d="M6.5 6.5 17.5 17.5" />
    <path d="m21 21-1-1" />
    <path d="m3 3 1 1" />
    <path d="m18 22 4-4" />
    <path d="m2 6 4-4" />
    <path d="m3 10 7-7" />
    <path d="m14 21 7-7" />
  </svg>
)

export const IconApple = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 6c1.2-2.2 3-3.2 5-3" />
    <path d="M12 6c-1.1-1.5-2.6-2.2-4.5-2" />
    <path d="M12 7c-5-3.2-9.5.6-8.5 5.6C4.5 17.7 8 21 12 21s7.5-3.3 8.5-8.4C21.5 7.6 17 3.8 12 7Z" />
  </svg>
)

export const IconBookOpen = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.5 4.5A8.5 8.5 0 0 1 12 6v15a8.5 8.5 0 0 0-9.5-1.5Z" />
    <path d="M21.5 4.5A8.5 8.5 0 0 0 12 6v15a8.5 8.5 0 0 1 9.5-1.5Z" />
  </svg>
)

export const IconUser = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-3.5 3.5-6 8-6s8 2.5 8 6" />
  </svg>
)

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 12.5 9 17.5 20 6.5" />
  </svg>
)

export const IconLock = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
)

export const IconChevronRight = (p: P) => (
  <svg {...base(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export const IconArrowLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="M19 12H5" />
    <path d="m12 5-7 7 7 7" />
  </svg>
)

export const IconLogout = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
)

export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
)

export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

export const IconCopy = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </svg>
)

export const IconKey = (p: P) => (
  <svg {...base(p)}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.5 12.5 9-9" />
    <path d="m17 5 3 3" />
    <path d="m14 8 3 3" />
  </svg>
)

export const IconX = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18" />
    <path d="M6 6l12 12" />
  </svg>
)

export const IconFlame = (p: P) => (
  <svg {...base({ fill: 'currentColor', stroke: 'none', ...p })}>
    <path d="M12 2c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1 .3-1.8.8-2.5C8 9 9 7 9 5c2 .5 2.5 2 3 3 .3-2-.3-4 0-6Z" />
  </svg>
)

export const IconPlay = (p: P) => (
  <svg {...base({ fill: 'currentColor', stroke: 'none', ...p })}>
    <path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.4-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5Z" />
  </svg>
)

export const IconChevronDown = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)

export const IconFileText = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
    <path d="M9 13h6" />
    <path d="M9 17h6" />
  </svg>
)

export const IconExternal = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
  </svg>
)

export const IconEye = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const IconEyeOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M10.7 6.2A9.7 9.7 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3 3.6" />
    <path d="M6.6 6.6A16 16 0 0 0 2 12s3.5 6 10 6a9.5 9.5 0 0 0 4.5-1.1" />
    <path d="m2 2 20 20" />
    <path d="M9.5 9.7a3 3 0 0 0 4.2 4.2" />
  </svg>
)
