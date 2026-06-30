'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import {
  fetchWhatsAppLines,
  fetchLeads,
  fetchSequences,
  fetchAudioVariants,
  uploadAudioVariant,
  deleteAudioVariant,
  createSequence,
  syncChats,
} from '@/lib/api';
import { PIPELINE_LABELS, PIPELINE_COLORS, formatDate } from '@/lib/utils';
import { ArrowLeft, Upload, Trash2, Music, Zap, Users, RefreshCw, Plus } from 'lucide-react';

export default function LineDetailPage() {
  const params = useParams();
  const lineId = params.id as string;

  const [line, setLine] = useState<any>(null);
  const [audios, setAudios] = useState<any[]>([]);
  const [sequences, setSequences] = useState<any[]>([]);
  const [leadStats, setLeadStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'audios' | 'secuencias' | 'leads'>('audios');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [linesData, audiosData, seqsData, leadsData] = await Promise.all([
        fetchWhatsAppLines(),
        fetchAudioVariants(lineId),
        fetchSequences().then(s => s.filter((seq: any) => seq.whatsapp_line_id === lineId)),
        fetchLeads({ line_id: lineId, limit: '1' }),
      ]);
      setLine(linesData.find((l: any) => l.id === lineId));
      setAudios(audiosData);
      setSequences(seqsData);

      // Stats por linea
      const res = await fetch(`/api/leads/stats?line_id=${lineId}`, {
        headers: { 'x-api-key': 'prospeccion-api-key-2026' },
      });
      const stats = await res.json();
      setLeadStats(stats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [lineId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-4 md:p-8 pt-16 md:pt-8"><div className="text-gray-500">Cargando...</div></main>
      </div>
    );
  }

  if (!line) {
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-4 md:p-8 pt-16 md:pt-8"><div className="text-red-500">Linea no encontrada</div></main>
      </div>
    );
  }

  const totalLeads = Object.values(leadStats).reduce((a: number, b: any) => a + (b as number), 0);

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 pt-16 md:pt-8">
        <Link href="/whatsapp" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft size={16} /> Volver a lineas
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{line.display_name}</h2>
              <p className="text-sm text-gray-500 font-mono">{line.phone_number} - {line.instance_name}</p>
            </div>
            <div className="flex gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900">{totalLeads}</div>
                <div className="text-xs text-gray-500">Leads</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{leadStats.contactado ?? 0}</div>
                <div className="text-xs text-gray-500">Contactados</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{leadStats.respondio ?? 0}</div>
                <div className="text-xs text-gray-500">Respondieron</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{audios.length}</div>
                <div className="text-xs text-gray-500">Audios</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">{sequences.length}</div>
                <div className="text-xs text-gray-500">Secuencias</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6">
          {[
            { key: 'audios', label: 'Audios', icon: Music },
            { key: 'secuencias', label: 'Secuencias', icon: Zap },
            { key: 'leads', label: 'Leads', icon: Users },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'audios' && (
          <AudiosTab lineId={lineId} audios={audios} onUpdate={loadData} />
        )}
        {tab === 'secuencias' && (
          <SequencesTab lineId={lineId} sequences={sequences} onUpdate={loadData} />
        )}
        {tab === 'leads' && (
          <LeadsTab lineId={lineId} stats={leadStats} />
        )}
      </main>
    </div>
  );
}

function AudiosTab({ lineId, audios, onUpdate }: { lineId: string; audios: any[]; onUpdate: () => void }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name.replace(/\.[^.]+$/, ''));
    formData.append('line_id', lineId);

    try {
      await uploadAudioVariant(formData);
      onUpdate();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar este audio?')) return;
    await deleteAudioVariant(id);
    onUpdate();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Audios de esta linea</h3>
        <label className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer flex items-center gap-2 text-sm">
          <Upload size={16} /> {uploading ? 'Subiendo...' : 'Subir audio'}
          <input type="file" accept=".ogg,.mp3,.m4a,.opus,.wav" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {audios.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Music size={48} className="mx-auto mb-3" />
          <p>Sin audios. Subi al menos uno para poder enviar notas de voz.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {audios.map((audio) => (
            <div key={audio.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Music size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{audio.name}</p>
                  <p className="text-xs text-gray-500">
                    {audio.duration_seconds ? `${Math.round(audio.duration_seconds)}s` : 'Audio'} -
                    {audio.is_active ? ' Activo' : ' Inactivo'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(audio.id)}
                className="text-red-400 hover:text-red-600 p-2"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SequencesTab({ lineId, sequences, onUpdate }: { lineId: string; sequences: any[]; onUpdate: () => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createSequence({
        name,
        steps: [
          { channel_id: 'whatsapp', message_template: '', use_audio: true, delay_hours: 0, condition: 'always' },
        ],
      });
      setName('');
      setShowCreate(false);
      onUpdate();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Secuencias de esta linea</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
        >
          <Plus size={16} /> Nueva secuencia
        </button>
      </div>

      {showCreate && (
        <div className="p-4 bg-gray-50 rounded-lg mb-4 flex gap-3">
          <input
            type="text"
            placeholder="Nombre de la secuencia"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button onClick={handleCreate} disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">
            {saving ? 'Creando...' : 'Crear (1 paso: audio)'}
          </button>
          <button onClick={() => setShowCreate(false)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">Cancelar</button>
        </div>
      )}

      {sequences.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Zap size={48} className="mx-auto mb-3" />
          <p>Sin secuencias para esta linea.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sequences.map((seq) => (
            <div key={seq.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{seq.name}</p>
                <p className="text-xs text-gray-500">
                  {seq.is_active ? 'Activa' : 'Inactiva'}
                  {seq.target_niche && ` - Nicho: ${seq.target_niche}`}
                </p>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${seq.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {seq.is_active ? 'Activa' : 'Inactiva'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeadsTab({ lineId, stats }: { lineId: string; stats: Record<string, number> }) {
  const [leads, setLeads] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { line_id: lineId, limit: '25' };
    if (statusFilter) params.status = statusFilter;
    fetchLeads(params)
      .then((res) => { setLeads(res.data); setCount(res.count); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [lineId, statusFilter]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Leads de esta linea ({count})</h3>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos</option>
          {Object.entries(PIPELINE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v} ({stats[k] ?? 0})</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-gray-500 py-4">Cargando...</div>
      ) : leads.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Users size={48} className="mx-auto mb-3" />
          <p>Sin leads asignados a esta linea. Importa un CSV y selecciona esta linea.</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-500">Nombre</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">Telefono</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">Rubro</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <Link href={`/leads/${lead.id}`} className="text-blue-600 hover:underline">
                    {lead.first_name}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-gray-600">{lead.phone}</td>
                <td className="px-3 py-2 text-gray-600">{lead.rubro || '-'}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PIPELINE_COLORS[lead.pipeline_status]}`}>
                    {PIPELINE_LABELS[lead.pipeline_status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
