import {
  ArrowLeftRight,
  Bell,
  BookOpen,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter,
  GripVertical,
  Heart,
  Info,
  Library,
  Link,
  List,
  LayoutGrid,
  LogOut,
  MapPin,
  Minus,
  Monitor,
  Moon,
  Ellipsis,
  Pencil,
  Plus,
  Search,
  Server,
  Settings,
  Smartphone,
  Square,
  Sun,
  Trash2,
  TriangleAlert,
  User,
  Users,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react';

const ICONS = {
  book: BookOpen,
  library: Library,
  loans: ArrowLeftRight,
  heart: Heart,
  chart: ChartColumn,
  phone: Smartphone,
  settings: Settings,
  search: Search,
  plus: Plus,
  filter: Filter,
  grid: LayoutGrid,
  list: List,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  close: X,
  minimize: Minus,
  maximize: Square,
  restore: Copy,
  check: Check,
  pencil: Pencil,
  trash: Trash2,
  pin: MapPin,
  wifi: Wifi,
  server: Server,
  monitor: Monitor,
  link: Link,
  grip: GripVertical,
  more: Ellipsis,
  alert: TriangleAlert,
  info: Info,
  logout: LogOut,
  sun: Sun,
  moon: Moon,
  users: Users,
  user: User,
  bell: Bell,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export interface IconProps {
  name: IconName;
  size?: number;
}

/** The only place that maps Bookeeper icon names onto Lucide. Decorative: hidden from AT. */
export function Icon({ name, size = 16 }: IconProps) {
  const Glyph = ICONS[name];
  return <Glyph size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
}
