'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import {
  Users,
  Inbox,
  Zap,
  Phone,
  BarChart3,
  Database,
  UserCog,
  LogOut,
} from 'lucide-react';

const adminNav = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/databases', label: 'Bases de Datos', icon: Database },
  { href: '/sequences', label: 'Secuencias', icon: Zap },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/whatsapp', label: 'WhatsApp Lines', icon: Phone },
  { href: '/usuarios', label: 'Usuarios', icon: UserCog },
];

const agentNav = [{ href: '/inbox', label: 'Inbox', icon: Inbox }];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const nav = user?.role === 'agent' ? agentNav : adminNav;

  return (
    <aside className="w-64 bg-white border-r border-gray-200 min-h-screen p-4 flex flex-col">
      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-900">Prospeccion</h1>
        <p className="text-sm text-gray-500">Panel de control</p>
      </div>
      <nav className="space-y-1 flex-1">
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

      {/* Usuario actual + logout */}
      <div className="border-t border-gray-100 pt-3 mt-3">
        {user && (
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
            <p className="text-xs text-gray-400 truncate">
              {user.role === 'admin' ? 'Administrador' : 'Empleado'}
            </p>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
