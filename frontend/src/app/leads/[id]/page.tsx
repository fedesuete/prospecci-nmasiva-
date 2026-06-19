'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { fetchLeadDetail, sendWhatsApp, sendEmailMessage } from '@/lib/api';
import { PIPELINE_LABELS, PIPELINE_COLORS, TEMP_LABELS, CHANNEL_LABELS, formatDate } from '@/lib/utils';
import { ArrowLeft, Send } from 'lucide-react';
import Link from 'next/link';

export default function LeadDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendChannel, setSendChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [emailSubject, setEmailSubject] = useState('');

  const loadDetail = () => {
    fetchLeadDetail(id)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDetail(); }, [id]);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      if (sendChannel === 'whatsapp') {
        await sendWhatsApp(id, message);
      } else {
        await sendEmailMessage(id, emailSubject || 'Sin asunto', message);
      }
      setMessage('');
      setEmailSubject('');
      loadDetail();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">
          <div className="text-gray-500">Cargando...</div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">
          <div className="text-red-500">Lead no encontrado</div>
        </main>
      </div>
    );
  }

  const { lead, messages, enrollment, history } = data;

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <Link href="/leads" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft size={16} /> Volver a leads
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Info del lead */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                {lead.first_name} {lead.last_name ?? ''}
              </h2>
              {lead.company_name && (
                <p className="text-gray-500 mb-3">{lead.company_name}</p>
              )}

              <div className="flex gap-2 mb-4">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PIPELINE_COLORS[lead.pipeline_status]}`}>
                  {PIPELINE_LABELS[lead.pipeline_status]}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${lead.temperature === 'warm' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                  {TEMP_LABELS[lead.temperature]}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <InfoRow label="Teléfono" value={lead.phone} />
                <InfoRow label="Email" value={lead.email} />
                <InfoRow label="Instagram" value={lead.instagram_handle ? `@${lead.instagram_handle}` : null} />
                <InfoRow label="Nicho" value={lead.niche} />
                <InfoRow label="Ciudad" value={lead.city} />
                <InfoRow label="Rubro" value={lead.rubro} />
                <InfoRow label="Creado" value={formatDate(lead.created_at)} />
              </div>

              {enrollment && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs font-medium text-blue-700">Secuencia activa</p>
                  <p className="text-sm text-blue-900">Paso {enrollment.current_step_order} - {enrollment.status}</p>
                </div>
              )}

              {lead.tags?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1">
                  {lead.tags.map((tag: string) => (
                    <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{tag}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Historial de pipeline */}
            {history?.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Historial</h3>
                <div className="space-y-2">
                  {history.map((h: any) => (
                    <div key={h.id} className="text-xs text-gray-500">
                      <span className="font-medium">{PIPELINE_LABELS[h.from_status] ?? h.from_status}</span>
                      {' → '}
                      <span className="font-medium">{PIPELINE_LABELS[h.to_status] ?? h.to_status}</span>
                      <span className="ml-2">{formatDate(h.created_at)}</span>
                      {h.channel_id && <span className="ml-1 text-gray-400">via {CHANNEL_LABELS[h.channel_id] ?? h.channel_id}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Mensajes */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col" style={{ height: '70vh' }}>
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">Conversación</h3>
              </div>

              {/* Lista de mensajes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages?.length === 0 ? (
                  <p className="text-gray-400 text-center mt-8">Sin mensajes aún</p>
                ) : (
                  messages?.map((msg: any) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm ${
                          msg.direction === 'outbound'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs opacity-75">
                            {CHANNEL_LABELS[msg.channel_id] ?? msg.channel_id}
                          </span>
                          {msg.content_type === 'audio' && (
                            <span className="text-xs opacity-75">🎵 Audio</span>
                          )}
                        </div>
                        <p>{msg.content_type === 'audio' ? '[Nota de voz]' : msg.content}</p>
                        <p className={`text-xs mt-1 ${msg.direction === 'outbound' ? 'text-blue-200' : 'text-gray-400'}`}>
                          {formatDate(msg.created_at)} · {msg.status}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Enviar mensaje */}
              <div className="p-4 border-t border-gray-200">
                <div className="flex gap-2 mb-2">
                  <select
                    value={sendChannel}
                    onChange={(e) => setSendChannel(e.target.value as 'whatsapp' | 'email')}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                  </select>
                  {sendChannel === 'email' && (
                    <input
                      type="text"
                      placeholder="Asunto..."
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Escribir mensaje..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !message.trim()}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1 text-sm"
                  >
                    <Send size={16} />
                    {sending ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  );
}
