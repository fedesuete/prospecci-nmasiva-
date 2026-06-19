'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { fetchInbox, fetchWhatsAppLines } from '@/lib/api';
import { CHANNEL_LABELS, PIPELINE_LABELS, PIPELINE_COLORS, formatDate } from '@/lib/utils';
import { Inbox, RefreshCw } from 'lucide-react';

export default function InboxPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const [lines, setLines] = useState<any[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadData = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (channelFilter) params.channel = channelFilter;
    if (lineFilter) params.line_id = lineFilter;

    fetchInbox(params)
      .then((res) => {
        setMessages(res.messages);
        setTotal(res.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchWhatsAppLines().then(setLines).catch(() => {});
  }, []);

  useEffect(() => { loadData(); }, [channelFilter, lineFilter]);

  // Auto-refresh cada 15 segundos
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, channelFilter, lineFilter]);

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">Inbox ({total})</h2>
            {autoRefresh && (
              <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                Auto-refresh activo
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex items-center gap-1 hover:bg-gray-50"
            >
              <RefreshCw size={14} /> Actualizar
            </button>
            <select
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todas las lineas</option>
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.display_name}
                </option>
              ))}
            </select>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos los canales</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="instagram_oficial">Instagram</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {loading && messages.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Cargando...</div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Inbox size={48} className="mx-auto mb-4 text-gray-300" />
              <p>No hay mensajes entrantes</p>
              <p className="text-sm mt-1">Las respuestas de los leads aparecen aca automaticamente</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {messages.map((msg) => {
                const lead = typeof msg.lead === 'string' ? JSON.parse(msg.lead) : msg.lead;
                return (
                  <Link
                    key={msg.id}
                    href={`/leads/${msg.lead_id}`}
                    className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                      {lead?.first_name?.[0]?.toUpperCase() ?? '?'}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm">
                          {lead?.first_name ?? 'Desconocido'} {lead?.last_name ?? ''}
                        </span>
                        {lead?.company_name && lead.company_name !== lead.first_name && (
                          <span className="text-xs text-gray-400">- {lead.company_name}</span>
                        )}
                        {lead?.pipeline_status && (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${PIPELINE_COLORS[lead.pipeline_status]}`}>
                            {PIPELINE_LABELS[lead.pipeline_status]}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 truncate mt-0.5">
                        {msg.content ?? '[Media]'}
                      </p>
                    </div>

                    {/* Canal y fecha */}
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs text-gray-400 block">
                        {CHANNEL_LABELS[msg.channel_id] ?? msg.channel_id}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDate(msg.created_at)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
