import type { ReactNode } from 'react';

function Svg({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const BackIcon = () => <Svg><path d="m15 18-6-6 6-6" /></Svg>;
export const SearchIcon = () => <Svg><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
export const BookmarkIcon = ({ filled = false }: { filled?: boolean }) => (
  <Svg filled={filled}><path d="M6 3h12v18l-6-4-6 4z" /></Svg>
);
export const AaIcon = () => <Svg><path d="M3 18 8 6l5 12M5 14h6M15 18l3-8 3 8M16 16h4" /></Svg>;
export const PanelIcon = () => <Svg><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></Svg>;
export const MoreIcon = () => <Svg><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Svg>;
export const TocIcon = () => <Svg><path d="M4 6h16M4 12h16M4 18h10" /></Svg>;
export const NoteIcon = () => <Svg><path d="M4 5h16v11H9l-5 4z" /></Svg>;
export const PhoneIcon = () => <Svg><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></Svg>;
export const ComputerIcon = () => <Svg><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>;
