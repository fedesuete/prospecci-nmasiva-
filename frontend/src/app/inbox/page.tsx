'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Sidebar } from '@/components/sidebar';
import { fetchConversations, fetchThread, sendReply, fetchLinesSummary } from '@/lib/api';
import { Inbox, Search, Send, Loader2, Phone } from 'lucide-react';

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return formatTime(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<{ lead: any; line_id: string | null; messages: any[] } | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [lineSummary, setLineSummary] = useState<any[]>([]);
  const [lineFilter, setLineFilter] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(() => {
    const params: Record<string, string> = { limit: '100' };
    if (lineFilter) params.line_id = lineFilter;
    fetchConversations(params).then(setConversations).catch(() => {});
    fetchLinesSummary().then(setLineSummary).catch(() => {});
  }, [lineFilter]);

  const loadThread = useCallback((leadId: string) => {
    setLoadingThread(true);
    fetchThread(leadId)
      .then(setThread)
      .catch(() => setThread(null))
      .finally(() => setLoadingThread(false));
  }, []);

  // Carga inicial + auto-refresh de la lista
  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 10000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  // Refrescar el hilo abierto cada 8s
  useEffect(() => {
    if (!selected) return;
    const interval = setInterval(() => loadThread(selected), 8000);
    return () => clearInterval(interval);
  }, [selected, loadThread]);

  // Scroll al final cuando cambian los mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages.length]);

  const openConversation = (leadId: string) => {
    setSelected(leadId);
    loadThread(leadId);
    // Limpiar el contador de no leídos localmente
    setConversations((prev) =>
      prev.map((c) => (c.lead_id === leadId ? { ...c, unread: '0' } : c))
    );
  };

  const handleSend = async () => {
    if (!reply.trim() || !selected || sending) return;
    setSending(true);
    const text = reply;
    setReply('');
    try {
      const res = await sendReply(selected, text);
      if (!res.success) {
        alert(res.error || 'No se pudo enviar');
        setReply(text);
      } else {
        loadThread(selected);
        loadConversations();
      }
    } catch (err) {
      alert((err as Error).message);
      setReply(text);
    } finally {
      setSending(false);
    }
  };

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = `${c.first_name ?? ''} ${c.last_name ?? ''} ${c.company_name ?? ''}`.toLowerCase();
    return name.includes(q) || (c.phone ?? '').includes(q);
  });

  const totalSinResponder = lineSummary.reduce((acc, l) => acc + parseInt(l.sin_responder ?? '0'), 0);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Barra horizontal de líneas con globito de "sin responder" */}
        <div className="border-b border-gray-200 bg-white px-3 py-2 flex gap-2 overflow-x-auto items-center flex-shrink-0">
          <button
            onClick={() => setLineFilter(null)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap border transition-colors ${
              lineFilter === null ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Todas
            {totalSinResponder > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {totalSinResponder}
              </span>
            )}
          </button>
          {lineSummary.map((l) => {
            const sin = parseInt(l.sin_responder ?? '0');
            const active = lineFilter === l.line_id;
            return (
              <button
                key={l.line_id}
                onClick={() => setLineFilter(l.line_id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap border transition-colors ${
                  active ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                title={`${l.total} conversaciones · ${sin} sin responder`}
              >
                <Phone size={13} className="text-gray-400" />
                {l.line_name}
                {sin > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {sin}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-1 overflow-hidden">

      {/* Lista de conversaciones */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Conversaciones</h2>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o teléfono"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              <Inbox size={36} className="mx-auto mb-2 text-gray-300" />
              No hay conversaciones
            </div>
          ) : (
            filtered.map((c) => {
              const unread = parseInt(c.unread ?? '0') > 0;
              const isSel = selected === c.lead_id;
              return (
                <button
                  key={c.lead_id}
                  onClick={() => openConversation(c.lead_id)}
                  className={`w-full text-left flex gap-3 p-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    isSel ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                    {c.first_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm text-gray-900 truncate">
                        {c.first_name ?? 'Desconocido'} {c.last_name ?? ''}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{formatDay(c.created_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className={`text-xs truncate ${unread ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                        {c.direction === 'outbound' ? 'Vos: ' : ''}
                        {c.content ?? '[Media]'}
                      </span>
                      {unread && (
                        <span className="bg-green-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0">
                          {c.unread}
                        </span>
                      )}
                    </div>
                    {c.line_name && (
                      <span className="text-[10px] text-gray-400 truncate block mt-0.5">{c.line_name}</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Panel del chat */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Inbox size={48} className="mx-auto mb-3 text-gray-300" />
              <p>Elegí una conversación para responder</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                {thread?.lead?.first_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">
                  {thread?.lead?.first_name ?? ''} {thread?.lead?.last_name ?? ''}
                </p>
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Phone size={11} /> {thread?.lead?.phone ?? ''}
                </p>
              </div>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-6 space-y-2">
              {loadingThread && !thread ? (
                <div className="text-center text-gray-400 text-sm">Cargando...</div>
              ) : (
                thread?.messages.map((m) => {
                  const out = m.direction === 'outbound';
                  return (
                    <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                          out
                            ? 'bg-green-500 text-white rounded-br-sm'
                            : 'bg-white text-gray-900 border border-gray-100 rounded-bl-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.content ?? '[Media]'}</p>
                        <p className={`text-[10px] mt-1 text-right ${out ? 'text-green-50' : 'text-gray-400'}`}>
                          {formatTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Caja de respuesta */}
            <div className="bg-white border-t border-gray-200 p-4 flex items-end gap-2">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder="Escribí un mensaje... (Enter para enviar)"
                className="flex-1 resize-none border border-gray-300 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-32"
              />
              <button
                onClick={handleSend}
                disabled={sending || !reply.trim()}
                className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-full w-11 h-11 flex items-center justify-center flex-shrink-0 transition-colors"
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </>
        )}
      </div>

        </div>
      </div>
    </div>
  );
}
