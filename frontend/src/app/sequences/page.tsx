'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/sidebar';
import {
  fetchSequences, fetchSequenceDetail, createSequence, updateSequence,
  setSequenceActive, deleteSequence, enrollSequenceByTag, fetchInboxTags,
} from '@/lib/api';
import { tagColor } from '@/lib/utils';
import {
  Zap, Plus, Trash2, ChevronUp, ChevronDown, MessageSquare, Mail, Clock,
  Play, Pause, Users, X, Loader2, Flag, Rocket,
} from 'lucide-react';

interface Step {
  channel_id: 'whatsapp' | 'email';
  message_template: string;
  use_audio: boolean;
  delay_hours: number;
  condition: 'always' | 'if_no_reply' | 'if_replied';
}

const emptyStep = (): Step => ({ channel_id: 'whatsapp', message_template: '', use_audio: false, delay_hours: 0, condition: 'always' });

export default function SequencesPage() {
  const [sequences, setSequences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id?: string; name: string; steps: Step[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [enrollFor, setEnrollFor] = useState<any | null>(null);
  const [enrollTag, setEnrollTag] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [tags, setTags] = useState<string[]>([]);

  const load = () => {
    setLoading(true);
    fetchSequences().then(setSequences).catch(() => {}).finally(() => setLoading(false));
    fetchInboxTags().then(setTags).catch(() => {});
  };
  useEffect(load, []);

  const newSequence = () => setEditing({ name: '', steps: [emptyStep()] });

  const editSequence = async (s: any) => {
    const full = await fetchSequenceDetail(s.id);
    setEditing({
      id: full.id,
      name: full.name,
      steps: (full.steps ?? []).map((st: any) => ({
        channel_id: st.channel_id === 'email' ? 'email' : 'whatsapp',
        message_template: st.message_template ?? '',
        use_audio: !!st.use_audio,
        delay_hours: st.delay_hours ?? 0,
        condition: st.condition ?? 'always',
      })),
    });
  };

  const updateStep = (i: number, patch: Partial<Step>) =>
    setEditing((e) => e ? { ...e, steps: e.steps.map((s, idx) => idx === i ? { ...s, ...patch } : s) } : e);
  const addStep = () => setEditing((e) => e ? { ...e, steps: [...e.steps, emptyStep()] } : e);
  const removeStep = (i: number) => setEditing((e) => e ? { ...e, steps: e.steps.filter((_, idx) => idx !== i) } : e);
  const moveStep = (i: number, dir: -1 | 1) => setEditing((e) => {
    if (!e) return e;
    const j = i + dir;
    if (j < 0 || j >= e.steps.length) return e;
    const steps = [...e.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    return { ...e, steps };
  });

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return alert('Ponele un nombre a la secuencia');
    if (editing.steps.length === 0) return alert('Agregá al menos un paso');
    if (editing.steps.some((s) => !s.message_template.trim())) return alert('Hay pasos sin mensaje');
    setSaving(true);
    try {
      const payload = { name: editing.name.trim(), steps: editing.steps };
      if (editing.id) await updateSequence(editing.id, payload);
      else await createSequence(payload);
      setEditing(null);
      load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: any) => {
    try { await setSequenceActive(s.id, !s.is_active); load(); }
    catch (err) { alert((err as Error).message); }
  };

  const remove = async (s: any) => {
    if (!confirm(`¿Eliminar la secuencia "${s.name}"? Se cancelan sus envíos pendientes.`)) return;
    try { await deleteSequence(s.id); load(); } catch (err) { alert((err as Error).message); }
  };

  const doEnroll = async () => {
    if (!enrollFor || !enrollTag.trim()) return;
    setEnrolling(true);
    try {
      const r = await enrollSequenceByTag(enrollFor.id, enrollTag.trim());
      alert(`Enrolados: ${r.enrolled} · Ya en otra secuencia: ${r.skipped} (de ${r.total} con la etiqueta)`);
      setEnrollFor(null);
      setEnrollTag('');
      load();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setEnrolling(false);
    }
  };

  // ===== Vista builder =====
  if (editing) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-4 md:p-8 pt-16 md:pt-8 max-w-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">{editing.id ? 'Editar flujo' : 'Nuevo flujo'}</h2>
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />} Guardar
              </button>
            </div>
          </div>

          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Nombre del flujo (ej: Seguimiento clientes interesados)"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-6"
          />

          {/* Flujo visual */}
          <div className="flex flex-col items-center">
            <div className="bg-green-100 text-green-700 text-sm font-medium rounded-full px-4 py-1.5 flex items-center gap-2">
              <Rocket size={15} /> Lead enrolado
            </div>

            {editing.steps.map((step, i) => (
              <div key={i} className="w-full flex flex-col items-center">
                {/* Conector con delay */}
                <div className="h-5 w-px bg-gray-300" />
                <div className="text-xs text-gray-500 flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
                  <Clock size={12} />
                  <input
                    type="number" min={0}
                    value={step.delay_hours % 24 === 0 ? step.delay_hours / 24 : step.delay_hours}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 0;
                      const isDays = step.delay_hours % 24 === 0;
                      updateStep(i, { delay_hours: isDays ? v * 24 : v });
                    }}
                    className="w-12 text-center border border-gray-200 rounded px-1"
                  />
                  <select
                    value={step.delay_hours % 24 === 0 ? 'd' : 'h'}
                    onChange={(e) => {
                      const cur = step.delay_hours;
                      if (e.target.value === 'd') updateStep(i, { delay_hours: cur % 24 === 0 ? cur : cur * 24 });
                      else updateStep(i, { delay_hours: cur % 24 === 0 ? Math.max(1, cur) : cur });
                    }}
                    className="border border-gray-200 rounded px-1 bg-white"
                  >
                    <option value="d">días</option>
                    <option value="h">horas</option>
                  </select>
                  <span className="text-gray-400">después</span>
                </div>
                <div className="h-5 w-px bg-gray-300" />

                {/* Tarjeta del paso */}
                <div className={`w-full rounded-xl border-2 p-4 ${step.channel_id === 'whatsapp' ? 'border-green-200 bg-green-50/40' : 'border-blue-200 bg-blue-50/40'}`}>
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`flex items-center gap-1.5 text-sm font-semibold ${step.channel_id === 'whatsapp' ? 'text-green-700' : 'text-blue-700'}`}>
                        {step.channel_id === 'whatsapp' ? <MessageSquare size={16} /> : <Mail size={16} />}
                        Paso {i + 1}
                      </span>
                      <select value={step.channel_id} onChange={(e) => updateStep(i, { channel_id: e.target.value as any })} className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white">
                        <option value="whatsapp">WhatsApp</option>
                        <option value="email">Email</option>
                      </select>
                      <select value={step.condition} onChange={(e) => updateStep(i, { condition: e.target.value as any })} className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white">
                        <option value="always">Siempre</option>
                        <option value="if_no_reply">Si no respondió</option>
                        <option value="if_replied">Si respondió</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 p-0.5"><ChevronUp size={16} /></button>
                      <button onClick={() => moveStep(i, 1)} disabled={i === editing.steps.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 p-0.5"><ChevronDown size={16} /></button>
                      <button onClick={() => removeStep(i)} className="text-gray-400 hover:text-red-600 p-0.5"><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <textarea
                    value={step.message_template}
                    onChange={(e) => updateStep(i, { message_template: e.target.value })}
                    rows={step.channel_id === 'email' ? 4 : 3}
                    placeholder={step.channel_id === 'email' ? 'Primera línea = asunto\nResto = cuerpo del email...' : 'Mensaje de WhatsApp... (podés usar {first_name}, {company_name})'}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                  />
                  {step.channel_id === 'whatsapp' && (
                    <label className="flex items-center gap-2 text-xs text-gray-600 mt-2">
                      <input type="checkbox" checked={step.use_audio} onChange={(e) => updateStep(i, { use_audio: e.target.checked })} />
                      Enviar como audio (usa los audios cargados de la línea)
                    </label>
                  )}
                </div>
              </div>
            ))}

            <div className="h-5 w-px bg-gray-300" />
            <button onClick={addStep} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 border border-dashed border-blue-300 rounded-full px-4 py-1.5">
              <Plus size={15} /> Agregar paso
            </button>
            <div className="h-5 w-px bg-gray-300" />
            <div className="bg-gray-100 text-gray-500 text-sm rounded-full px-4 py-1.5 flex items-center gap-2">
              <Flag size={14} /> Fin del flujo
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-6">
            💡 El flujo se cancela solo si el cliente responde. Los pasos de WhatsApp salen por tus líneas con los delays anti-bloqueo. El email necesita una cuenta SMTP configurada.
          </p>
        </main>
      </div>
    );
  }

  // ===== Vista lista =====
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 pt-16 md:pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Flujos de seguimiento</h2>
            <p className="text-sm text-gray-500">Secuencias automáticas multicanal (WhatsApp + Email)</p>
          </div>
          <button onClick={newSequence} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2">
            <Plus size={16} /> Nuevo flujo
          </button>
        </div>

        {loading ? (
          <div className="text-gray-500">Cargando...</div>
        ) : sequences.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
            <Zap size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No hay flujos todavía</p>
            <p className="text-sm mt-1">Creá un flujo de seguimiento (ej: WhatsApp → esperar 2 días → Email)</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {sequences.map((s) => (
              <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{s.name}</h3>
                    <p className="text-xs text-gray-500">{s.step_count} paso(s)</p>
                  </div>
                  <button
                    onClick={() => toggleActive(s)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${s.is_active ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'}`}
                  >
                    {s.is_active ? <Play size={11} /> : <Pause size={11} />}
                    {s.is_active ? 'Activo' : 'Pausado'}
                  </button>
                </div>
                <div className="flex gap-3 text-xs text-gray-500 mb-3">
                  <span><strong className="text-blue-600">{s.active_count}</strong> en curso</span>
                  <span><strong className="text-green-600">{s.replied_count}</strong> respondieron</span>
                  <span><strong>{s.completed_count}</strong> completados</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => editSequence(s)} className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Editar flujo</button>
                  <button onClick={() => { setEnrollFor(s); setEnrollTag(''); }} className="flex-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center justify-center gap-1">
                    <Users size={13} /> Enrolar
                  </button>
                  <button onClick={() => remove(s)} className="px-2 py-1.5 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal enrolar por etiqueta */}
      {enrollFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Enrolar en "{enrollFor.name}"</h3>
              <button onClick={() => setEnrollFor(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Enrolá todos los clientes con una etiqueta en este flujo de seguimiento.</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Etiqueta</label>
            <input
              list="enroll-tags"
              value={enrollTag}
              onChange={(e) => setEnrollTag(e.target.value)}
              placeholder="ej: interesado"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
            />
            <datalist id="enroll-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {tags.slice(0, 8).map((t) => (
                <button key={t} onClick={() => setEnrollTag(t)} className={`text-xs rounded-full px-2 py-0.5 ${tagColor(t)}`}>{t}</button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEnrollFor(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={doEnroll} disabled={enrolling || !enrollTag.trim()} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                {enrolling && <Loader2 size={14} className="animate-spin" />} Enrolar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
