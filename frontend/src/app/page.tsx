'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { fetchLeadStats, fetchLinesHealth } from '@/lib/api';
import { PIPELINE_LABELS, PIPELINE_COLORS } from '@/lib/utils';
import { Users, MessageSquare, TrendingUp, UserCheck, AlertTriangle, Wifi, WifiOff, Phone } from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [health, setHealth] = useState<{ lines: any[]; alerts: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    Promise.all([
      fetchLeadStats().catch(() => ({})),
      fetchLinesHealth().catch(() => null),
    ]).then(([s, h]) => {
      setStats(s);
      setHealth(h);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    // Auto-refresh cada 30 segundos
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  const respondieron = (stats.respondio ?? 0) + (stats.calificado ?? 0) + (stats.agendado ?? 0) + (stats.cliente ?? 0);
  const tasa = total > 0 ? ((respondieron / total) * 100).toFixed(1) : '0';

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>

        {/* Alertas de lineas caidas */}
        {health?.alerts && health.alerts.length > 0 && (
          <div className="mb-6 space-y-2">
            {health.alerts.map((alert: any, i: number) => (
              <div key={i} className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                <AlertTriangle size={20} className="text-red-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-red-800">
                    {alert.display_name} ({alert.phone_number})
                  </p>
                  <p className="text-sm text-red-600">{alert.alert}</p>
                </div>
                <Link href="/whatsapp" className="text-sm text-red-700 underline">
                  Ver lineas
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Estado de lineas */}
        {health?.lines && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {health.lines.map((line: any) => (
              <Link
                key={line.id}
                href={`/whatsapp/${line.id}`}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">{line.display_name}</span>
                  </div>
                  {line.evo_status === 'open' ? (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <Wifi size={12} />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-red-500">
                      <WifiOff size={12} />
                    </span>
                  )}
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{line.sent_today}/{line.daily_limit} enviados</span>
                  <span className={line.evo_status === 'open' ? 'text-green-600' : 'text-red-500'}>
                    {line.evo_status === 'open' ? 'Conectada' : line.db_status === 'banned' ? 'Suspendida' : 'Desconectada'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* KPIs principales */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <KPICard
            title="Total Leads"
            value={total}
            icon={<Users size={24} />}
            color="blue"
            loading={loading}
          />
          <KPICard
            title="Contactados"
            value={stats.contactado ?? 0}
            icon={<MessageSquare size={24} />}
            color="indigo"
            loading={loading}
          />
          <KPICard
            title="Respondieron"
            value={respondieron}
            icon={<UserCheck size={24} />}
            color="green"
            loading={loading}
          />
          <KPICard
            title="Tasa Respuesta"
            value={`${tasa}%`}
            icon={<TrendingUp size={24} />}
            color="purple"
            loading={loading}
          />
        </div>

        {/* Pipeline */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Pipeline</h3>
          {loading ? (
            <div className="text-gray-500">Cargando...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {Object.entries(PIPELINE_LABELS).map(([key, label]) => (
                <div
                  key={key}
                  className="text-center p-4 rounded-lg border border-gray-100"
                >
                  <div className="text-2xl font-bold text-gray-900">
                    {stats[key] ?? 0}
                  </div>
                  <div className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${PIPELINE_COLORS[key]}`}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function KPICard({
  title,
  value,
  icon,
  color,
  loading,
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
}) {
  const bgColor = {
    blue: 'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
  }[color] ?? 'bg-gray-50 text-gray-600';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <div className={`p-2 rounded-lg ${bgColor}`}>{icon}</div>
      </div>
      <div className="text-3xl font-bold text-gray-900">
        {loading ? '...' : value}
      </div>
    </div>
  );
}
