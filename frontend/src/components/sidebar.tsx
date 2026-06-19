'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Users,
  MessageSquare,
  Inbox,
  Zap,
  Phone,
  Upload,
  BarChart3,
  Database,
} from 'lucide-react';

const nav = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/databases', label: 'Bases de Datos', icon: Database },
  { href: '/sequences', label: 'Secuencias', icon: Zap },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/whatsapp', label: 'WhatsApp Lines', icon: Phone },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen p-4">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-900">Prospeccion</h1>
        <p className="text-sm text-gray-500">Panel de control</p>
      </div>
      <nav className="space-y-1">
        {nav.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
