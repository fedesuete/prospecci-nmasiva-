'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Sidebar } from '@/components/sidebar';
import {
  fetchConversations, fetchThread, sendReply, fetchLinesSummary,
  sendReplyAudio, fetchQuickReplies, createQuickReply, deleteQuickReply, type QuickReply,
  fetchInboxTags, setLeadTags,
} from '@/lib/api';
import { Inbox, Search, Send, Loader2, Phone, Mic, Smile, FileText, X, Trash2, Square, ChevronLeft, Tag, Plus } from 'lucide-react';
import { tagColor } from '@/lib/utils';

const EMOJIS = [
  '😀','😁','😂','🤣','😊','😍','😘','😎','🤩','🥳','👍','👌','🙏','💪','🔥','✨','🎉','✅','❤️','💯',
  '🙌','👏','🤝','😉','😅','🤔','😬','🙈','😴','😢','😭','😡','🥺','😱','🤯','💰','💸','📈','📲','📱',
  '💬','📞','⏰','📅','🚀','⭐','🎁','☕','🍕','🛒',
];

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

  // Emojis, plantillas y grabación de audio
  const [showEmojis, setShowEmojis] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<QuickReply[]>([]);
  const [recording, setRecording] = useState(false);
  const [sendingAudio, setSendingAudio] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRef = useRef(false);

  // Etiquetas
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  useEffect(() => {
    fetchQuickReplies().then(setTemplates).catch(() => {});
    fetchInboxTags().then(setAllTags).catch(() => {});
  }, []);

  const leadTags: string[] = thread?.lead?.tags ?? [];

  const saveTags = async (tags: string[]) => {
    if (!selected) return;
    setThread((prev) => (prev ? { ...prev, lead: { ...prev.lead, tags } } : prev));
    try {
      await setLeadTags(selected, tags);
      fetchInboxTags().then(setAllTags).catch(() => {});
      loadConversations();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const addTag = (t: string) => {
    const tag = t.trim();
    if (!tag || leadTags.includes(tag)) { setTagDraft(''); setShowTagInput(false); return; }
    saveTags([...leadTags, tag]);
    setTagDraft('');
    setShowTagInput(false);
  };

  const removeTag = (t: string) => saveTags(leadTags.filter((x) => x !== t));

  const insertText = (t: string) => {
    setReply((prev) => (prev ? prev + (prev.endsWith(' ') ? '' : ' ') + t : t));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      cancelRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelRef.current) return;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size < 500 || !selected) return;
        setSendingAudio(true);
        try {
          const res = await sendReplyAudio(selected, blob);
          if (!res.success) alert(res.error || 'No se pudo enviar el audio');
          else { loadThread(selected); loadConversations(); }
        } catch (err) {
          alert((err as Error).message);
        } finally {
          setSendingAudio(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      alert('No pude acceder al micrófono. Permití el acceso en el navegador.');
    }
  };

  const stopRecording = (cancel: boolean) => {
    cancelRef.current = cancel;
    recorderRef.current?.stop();
    setRecording(false);
  };

  const addTemplate = async () => {
    const title = prompt('Nombre de la plantilla:');
    if (!title) return;
    const text = prompt('Texto de la plantilla:');
    if (!text) return;
    try {
      await createQuickReply(title, text);
      setTemplates(await fetchQuickReplies());
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const removeTemplate = async (id: string) => {
    try {
      await deleteQuickReply(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {}
  };

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
        <div className="border-b border-gray-200 bg-white pl-14 md:pl-3 pr-3 py-2 flex gap-2 overflow-x-auto items-center flex-shrink-0">
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
      <div className={`${selected ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 border-r border-gray-200 bg-white`}>
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
                        {c.content_type === 'audio' ? '🎤 Audio'
                          : c.content_type === 'image' ? '📷 Imagen'
                          : (c.content ?? '[Media]')}
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
                    {Array.isArray(c.tags) && c.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.tags.slice(0, 3).map((t: string) => (
                          <span key={t} className={`text-[9px] rounded px-1 py-0.5 ${tagColor(t)}`}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Panel del chat */}
      <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-gray-50`}>
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
            <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center gap-3">
              <button
                onClick={() => setSelected(null)}
                className="md:hidden text-gray-500 -ml-1 p-1"
                aria-label="Volver"
              >
                <ChevronLeft size={22} />
              </button>
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

            {/* Barra de etiquetas (seguimiento) */}
            <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-1.5 flex items-center gap-1.5 flex-wrap">
              <Tag size={13} className="text-gray-400 flex-shrink-0" />
              {leadTags.map((t) => (
                <span key={t} className={`inline-flex items-center gap-1 text-xs rounded-full pl-2 pr-1 py-0.5 ${tagColor(t)}`}>
                  {t}
                  <button onClick={() => removeTag(t)} className="hover:opacity-60"><X size={12} /></button>
                </span>
              ))}
              {showTagInput ? (
                <input
                  autoFocus
                  list="tag-suggestions"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTag(tagDraft); if (e.key === 'Escape') { setShowTagInput(false); setTagDraft(''); } }}
                  onBlur={() => { if (tagDraft.trim()) addTag(tagDraft); else setShowTagInput(false); }}
                  placeholder="etiqueta..."
                  className="text-xs border border-gray-300 rounded-full px-2 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              ) : (
                <button onClick={() => setShowTagInput(true)} className="inline-flex items-center gap-0.5 text-xs text-gray-500 hover:text-blue-600 border border-dashed border-gray-300 rounded-full px-2 py-0.5">
                  <Plus size={12} /> Etiqueta
                </button>
              )}
              <datalist id="tag-suggestions">
                {allTags.map((t) => <option key={t} value={t} />)}
              </datalist>
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
                        {m.content_type === 'audio' && typeof m.content === 'string' && m.content.startsWith('/api/media/') ? (
                          <audio controls src={m.content} className="max-w-[230px] h-9" />
                        ) : m.content_type === 'image' && typeof m.content === 'string' && m.content.startsWith('/api/media/') ? (
                          <img src={m.content} alt="imagen" className="max-w-[230px] rounded-lg" />
                        ) : m.content_type === 'audio' ? (
                          <p className="italic opacity-80">🎤 Audio</p>
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{m.content ?? '[Media]'}</p>
                        )}
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
            <div className="bg-white border-t border-gray-200 p-3 relative">
              {/* Popover de emojis */}
              {showEmojis && (
                <div className="absolute bottom-full left-3 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg p-2 grid grid-cols-10 gap-1 w-72 z-20">
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => { insertText(e); }} className="text-xl hover:bg-gray-100 rounded p-0.5">
                      {e}
                    </button>
                  ))}
                </div>
              )}

              {/* Popover de plantillas */}
              {showTemplates && (
                <div className="absolute bottom-full left-3 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg p-2 w-80 max-h-72 overflow-y-auto z-20">
                  <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-600">Respuestas rápidas</span>
                    <button onClick={addTemplate} className="text-xs text-blue-600 hover:text-blue-800">+ Nueva</button>
                  </div>
                  {templates.length === 0 ? (
                    <p className="text-xs text-gray-400 p-2">No hay plantillas. Creá una con "+ Nueva".</p>
                  ) : (
                    templates.map((t) => (
                      <div key={t.id} className="flex items-start gap-2 px-2 py-1.5 hover:bg-gray-50 rounded group">
                        <button
                          onClick={() => { insertText(t.text); setShowTemplates(false); }}
                          className="flex-1 text-left"
                        >
                          <p className="text-xs font-medium text-gray-800">{t.title}</p>
                          <p className="text-xs text-gray-500 truncate">{t.text}</p>
                        </button>
                        <button onClick={() => removeTemplate(t.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {recording ? (
                /* Modo grabación */
                <div className="flex items-center gap-3 px-2">
                  <span className="flex items-center gap-2 text-red-500 text-sm font-medium flex-1">
                    <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" /> Grabando audio...
                  </span>
                  <button onClick={() => stopRecording(true)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                    Cancelar
                  </button>
                  <button
                    onClick={() => stopRecording(false)}
                    className="bg-green-500 hover:bg-green-600 text-white rounded-full w-11 h-11 flex items-center justify-center"
                    title="Enviar audio"
                  >
                    <Send size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => { setShowEmojis((v) => !v); setShowTemplates(false); }}
                    className={`p-2 rounded-full flex-shrink-0 ${showEmojis ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
                    title="Emojis"
                  >
                    <Smile size={20} />
                  </button>
                  <button
                    onClick={() => { setShowTemplates((v) => !v); setShowEmojis(false); }}
                    className={`p-2 rounded-full flex-shrink-0 ${showTemplates ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
                    title="Respuestas rápidas"
                  >
                    <FileText size={20} />
                  </button>
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                    rows={1}
                    placeholder="Escribí un mensaje... (Enter para enviar)"
                    className="flex-1 resize-none border border-gray-300 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-32"
                  />
                  {reply.trim() ? (
                    <button
                      onClick={handleSend}
                      disabled={sending}
                      className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-full w-11 h-11 flex items-center justify-center flex-shrink-0 transition-colors"
                      title="Enviar"
                    >
                      {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                  ) : (
                    <button
                      onClick={startRecording}
                      disabled={sendingAudio}
                      className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-full w-11 h-11 flex items-center justify-center flex-shrink-0 transition-colors"
                      title="Grabar audio"
                    >
                      {sendingAudio ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

        </div>
      </div>
    </div>
  );
}
