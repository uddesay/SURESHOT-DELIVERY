import {
  BadgePercent, Bell, Bike, BookOpen, ClipboardList as ClipboardListIcon, Boxes, BarChart3, ClipboardCheck, FileText, HelpCircle, Image, LayoutDashboard,
  LifeBuoy, ListTree, Newspaper, Package, Percent, RotateCcw, ScrollText, Settings, ShieldCheck, ShoppingBag, Star,
  Store, Tags, Truck, UserRound, Wallet, type LucideIcon,
} from 'lucide-react';

export type QueueKey = 'products' | 'vendors' | 'payouts' | 'returns' | 'tickets' | 'lowStock' | 'reviews';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
  /** Live count badge from the overview queues. */
  queue?: QueueKey;
  end?: boolean;
  keywords?: string;
}

export interface NavSection { id: string; title: string; items: NavItem[] }

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'analytics:read', end: true, keywords: 'home overview kpi' },
      { to: '/analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics:read', keywords: 'reports sales revenue charts' },
    ],
  },
  {
    id: 'catalog',
    title: 'Catalog',
    items: [
      { to: '/products', label: 'Products', icon: Package, permission: 'products:read', queue: 'products', keywords: 'listings items sku' },
      { to: '/categories', label: 'Categories', icon: ListTree, permission: 'categories:manage', keywords: 'taxonomy' },
      { to: '/brands', label: 'Brands', icon: Tags, permission: 'brands:manage' },
      { to: '/inventory', label: 'Inventory', icon: Boxes, permission: 'inventory:manage', queue: 'lowStock', keywords: 'stock warehouse' },
      { to: '/coupons', label: 'Coupons', icon: BadgePercent, permission: 'coupons:manage', keywords: 'discount promo code' },
    ],
  },
  {
    id: 'commerce',
    title: 'Commerce',
    items: [
      { to: '/orders', label: 'Orders', icon: ShoppingBag, permission: 'orders:read', keywords: 'sales purchases' },
      { to: '/returns', label: 'Returns', icon: RotateCcw, permission: 'returns:read', queue: 'returns', keywords: 'refunds exchanges rma' },
      { to: '/shipments', label: 'Shipments', icon: Truck, permission: 'orders:fulfill', keywords: 'fulfillment courier awb' },
      { to: '/payouts', label: 'Payouts', icon: Wallet, permission: 'payouts:approve', queue: 'payouts', keywords: 'settlements vendor payments' },
    ],
  },
  {
    id: 'delivery',
    title: 'Delivery',
    items: [
      { to: '/delivery', label: 'Dispatch', icon: Truck, permission: 'delivery:manage', end: true, keywords: 'assign rider delivery boy own fleet' },
      { to: '/delivery/partners', label: 'Delivery partners', icon: Bike, permission: 'delivery:manage', keywords: 'riders delivery boys fleet cod' },
      { to: '/delivery/applications', label: 'Rider applications', icon: ClipboardListIcon, permission: 'delivery:manage', keywords: 'apply join rider deliver with us approve' },
    ],
  },
  {
    id: 'marketplace',
    title: 'Marketplace',
    items: [
      { to: '/vendors', label: 'Vendors', icon: Store, permission: 'vendors:read', end: true, keywords: 'sellers stores' },
      { to: '/vendors/applications', label: 'Vendor applications', icon: ClipboardCheck, permission: 'vendors:read', queue: 'vendors', keywords: 'onboarding kyc approve' },
      { to: '/commissions', label: 'Commissions', icon: Percent, permission: 'categories:manage', keywords: 'take rate fees' },
    ],
  },
  {
    id: 'customers',
    title: 'Customers',
    items: [
      { to: '/customers', label: 'Customers', icon: UserRound, permission: 'users:read', keywords: 'buyers shoppers accounts' },
      { to: '/reviews', label: 'Reviews', icon: Star, permission: 'reviews:moderate', queue: 'reviews', keywords: 'ratings moderation' },
      { to: '/support/tickets', label: 'Support', icon: LifeBuoy, permission: 'support:manage', queue: 'tickets', keywords: 'tickets help desk' },
    ],
  },
  {
    id: 'content',
    title: 'Content',
    items: [
      { to: '/cms/banners', label: 'Banners', icon: Image, permission: 'cms:manage', keywords: 'hero homepage' },
      { to: '/cms/pages', label: 'Pages', icon: FileText, permission: 'cms:manage', keywords: 'about terms privacy' },
      { to: '/cms/blogs', label: 'Blog', icon: Newspaper, permission: 'cms:manage', keywords: 'posts articles' },
      { to: '/cms/faqs', label: 'FAQs', icon: HelpCircle, permission: 'cms:manage', keywords: 'questions help' },
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing',
    items: [
      { to: '/notifications', label: 'Notifications', icon: Bell, keywords: 'alerts inbox' },
    ],
  },
  {
    id: 'system',
    title: 'System',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings, permission: 'settings:manage', keywords: 'configuration platform' },
      { to: '/staff', label: 'Staff & roles', icon: ShieldCheck, permission: 'users:read', keywords: 'team admins permissions' },
      { to: '/audit-logs', label: 'Audit logs', icon: ScrollText, permission: 'audit_logs:read', keywords: 'history activity trail' },
    ],
  },
];

export type Workspace = 'platform' | 'marketplace' | 'store';

/** Workspaces focus the navigation on one job; Platform shows everything. */
export const WORKSPACES: Record<Workspace, { label: string; description: string; sections: string[] | 'all' }> = {
  platform: { label: 'Platform', description: 'Everything across Sureshot', sections: 'all' },
  marketplace: { label: 'Marketplace', description: 'Vendors, orders, delivery and payouts', sections: ['overview', 'marketplace', 'commerce', 'delivery', 'customers'] },
  store: { label: 'Store', description: 'Catalog, content and campaigns', sections: ['overview', 'catalog', 'commerce', 'content', 'marketing'] },
};

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title })));

/** Static labels for breadcrumb segments that are not nav items. */
export const SEGMENT_LABELS: Record<string, string> = {
  new: 'New',
  applications: 'Applications',
  cms: 'Content',
  support: 'Support',
  tickets: 'Tickets',
};

export const DOCS_ICON = BookOpen;
