'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { fetchInbox, fetchLeadMessages, sendWhatsApp, fetchWhatsAppLines } from '@/lib/api';
import { PIPELINE_LABELS, PIPELINE_COLORS, formatDate } from '@/lib/utils';
import { Send, Phone, Search, RefreshCw, MessageSquare } from 'lucide-react';

export default function ChatPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [lineFilter, setLineFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const params: Record<string, string> = { limit: '100' };
      if (lineFilter) params.line_id = lineFilter;
      const result = await fetchInbox(params);

      // Agrupar por lead - quedarse con el ultimo mensaje de cada lead
      const byLead = new Map<string, any>();
      for (const msg of result.messages) {
        const lead = typeof msg.lead === 'string' ? JSON.parse(msg.lead) : msg.lead;
        if (!byLead.has(msg.lead_id)) {
          byLead.set(msg.lead_id, { ...msg, lead });
        }
      }
      setConversations(Array.from(byLead.values()));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingConvos(false);
    }
  }, [lineFilter]);

  const loadMessages = useCallback(async (leadId: string) => {
    setLoadingMsgs(true);
    try {
      const msgs = await fetchLeadMessages(leadId);
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    fetchWhatsAppLines().then(setLines).catch(() => {});
    loadConversations();
  }, [loadConversations]);

  // Auto-refresh cada 10 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      loadConversations();
      if (selectedLead) loadMessages(selectedLead.lead_id);
    }, 10000);
    return () => clearInterval(interval);
  }, [loadConversations, loadMessages, selectedLead]);

  const handleSelectConvo = (convo: any) => {
    setSelectedLead(convo);
    loadMessages(convo.lead_id);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedLead) return;
    setSending(true);
    try {
      await sendWhatsApp(selectedLead.lead_id, newMessage);
      setNewMessage('');
      await loadMessages(selectedLead.lead_id);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const filteredConvos = search
    ? conversations.filter(c =>
        (c.lead?.first_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.lead?.phone || '').includes(search) ||
        (c.lead?.company_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar de conversaciones */}
      <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-blue-600">
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageSquare size={20} /> Conversaciones
          </h1>
        </div>

        {/* Filtros */}
        <div className="p-3 border-b border-gray-100 space-y-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o telefono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <select
            value={lineFilter}
            onChange={(e) => setLineFilter(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todas las lineas</option>
            {lines.map((line) => (
              <option key={line.id} value={line.id}>{line.display_name}</option>
            ))}
          </select>
        </div>

        {/* Lista de conversaciones */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvos ? (
            <div className="p-4 text-center text-gray-400">Cargando...</div>
          ) : filteredConvos.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <MessageSquare size={40} className="mx-auto mb-2" />
              <p className="text-sm">Sin conversaciones</p>
            </div>
          ) : (
            filteredConvos.map((convo) => (
              <div
                key={convo.id}
                onClick={() => handleSelectConvo(convo)}
                className={`flex items-center gap-3 p-3 cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  selectedLead?.lead_id === convo.lead_id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                }`}
              >
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                  {convo.lead?.first_name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 text-sm truncate">
                      {convo.lead?.first_name ?? 'Desconocido'}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {formatDate(convo.created_at).split(',')[0]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{convo.content ?? '[Media]'}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-gray-400 font-mono">{convo.lead?.phone}</span>
                    {convo.lead?.pipeline_status && (
                      <span className={`px-1 py-0 rounded text-xs ${PIPELINE_COLORS[convo.lead.pipeline_status]}`}>
                        {PIPELINE_LABELS[convo.lead.pipeline_status]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Panel de chat */}
      <div className="flex-1 flex flex-col">
        {!selectedLead ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare size={64} className="mx-auto mb-4" />
              <p className="text-lg">Selecciona una conversacion</p>
              <p className="text-sm">Clickea en un contacto a la izquierda para ver sus mensajes</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header del chat */}
            <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                  {selectedLead.lead?.first_name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {selectedLead.lead?.first_name} {selectedLead.lead?.last_name ?? ''}
                  </h2>
                  <p className="text-xs text-gray-500 font-mono">{selectedLead.lead?.phone}</p>
                </div>
              </div>
              {selectedLead.lead?.pipeline_status && (
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${PIPELINE_COLORS[selectedLead.lead.pipeline_status]}`}>
                  {PIPELINE_LABELS[selectedLead.lead.pipeline_status]}
                </span>
              )}
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {loadingMsgs ? (
                <div className="text-center text-gray-400 mt-8">Cargando mensajes...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-400 mt-8">Sin mensajes</div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-md px-4 py-2 rounded-2xl text-sm shadow-sm ${
                        msg.direction === 'outbound'
                          ? 'bg-blue-600 text-white rounded-br-md'
                          : 'bg-white text-gray-900 rounded-bl-md border border-gray-100'
                      }`}
                    >
                      {msg.content_type === 'audio' ? (
                        <p className="italic">🎵 Nota de voz</p>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                      <p className={`text-xs mt-1 ${msg.direction === 'outbound' ? 'text-blue-200' : 'text-gray-400'}`}>
                        {formatDate(msg.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input de mensaje */}
            <div className="p-4 bg-white border-t border-gray-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Escribir mensaje..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !newMessage.trim()}
                  className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
