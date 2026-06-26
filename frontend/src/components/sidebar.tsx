'use client';

import { useState } from 'react';
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
  Menu,
  X,
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
  const [open, setOpen] = useState(false);

  const nav = user?.role === 'agent' ? agentNav : adminNav;

  return (
    <>
      {/* Botón hamburguesa (solo móvil) */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-2.5 left-2.5 z-30 bg-white border border-gray-200 rounded-lg p-2 shadow-sm text-gray-700"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      {/* Overlay (solo móvil, cuando está abierto) */}
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)} />
      )}

      {/* Menú lateral / cajón */}
      <aside
        className={cn(
          'fixed md:static top-0 left-0 z-50 h-screen md:h-auto md:min-h-screen w-64 bg-white border-r border-gray-200 p-4 flex flex-col transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Prospeccion</h1>
            <p className="text-sm text-gray-500">Panel de control</p>
          </div>
          <button onClick={() => setOpen(false)} className="md:hidden text-gray-400 p-1" aria-label="Cerrar menú">
            <X size={20} />
          </button>
        </div>

        <nav className="space-y-1 flex-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
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
    </>
  );
}
