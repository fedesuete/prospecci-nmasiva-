'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/sidebar';
import { fetchSequences, createSequence, fetchWhatsAppLines } from '@/lib/api';
import { CHANNEL_LABELS, TEMP_LABELS } from '@/lib/utils';
import { Plus, Zap } from 'lucide-react';

export default function SequencesPage() {
  const [sequences, setSequences] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchSequences().catch(() => []),
      fetchWhatsAppLines().catch(() => []),
    ]).then(([seqs, lns]) => {
      setSequences(seqs);
      setLines(lns);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 pt-16 md:pt-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Secuencias</h2>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
          >
            <Plus size={16} /> Nueva secuencia
          </button>
        </div>

        {showCreate && (
          <CreateSequenceForm
            lines={lines}
            onCreated={() => {
              setShowCreate(false);
              fetchSequences().then(setSequences);
            }}
            onCancel={() => setShowCreate(false)}
          />
        )}

        <div className="space-y-4">
          {loading ? (
            <div className="text-gray-500">Cargando...</div>
          ) : sequences.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
              <Zap size={48} className="mx-auto mb-4 text-gray-300" />
              <p>No hay secuencias creadas</p>
              <p className="text-sm mt-1">Crea tu primera secuencia para automatizar el contacto</p>
            </div>
          ) : (
            sequences.map((seq) => (
              <div key={seq.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{seq.name}</h3>
                    <div className="flex gap-2 mt-1">
                      {seq.line_name && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          {seq.line_name}
                        </span>
                      )}
                      {seq.target_niche && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          Nicho: {seq.target_niche}
                        </span>
                      )}
                      {seq.target_city && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          Ciudad: {seq.target_city}
                        </span>
                      )}
                      {seq.target_temperature && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {TEMP_LABELS[seq.target_temperature]}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${seq.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {seq.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

function CreateSequenceForm({
  lines,
  onCreated,
  onCancel,
}: {
  lines: any[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [lineId, setLineId] = useState('');
  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('');
  const [temperature, setTemperature] = useState('');
  const [steps, setSteps] = useState([
    { step_order: 1, channel_id: 'whatsapp', message_template: '', use_audio: true, delay_hours: 0, condition: 'always' },
  ]);
  const [saving, setSaving] = useState(false);

  const addStep = () => {
    setSteps([...steps, {
      step_order: steps.length + 1,
      channel_id: 'whatsapp',
      message_template: '',
      use_audio: false,
      delay_hours: 48,
      condition: 'if_no_reply',
    }]);
  };

  const updateStep = (index: number, field: string, value: any) => {
    const updated = [...steps];
    (updated[index] as any)[field] = value;
    setSteps(updated);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_order: i + 1 })));
  };

  const handleSubmit = async () => {
    if (!name.trim()) return alert('Nombre requerido');
    setSaving(true);
    try {
      await createSequence({
        name,
        whatsapp_line_id: lineId || undefined,
        target_niche: niche || undefined,
        target_city: city || undefined,
        target_temperature: temperature || undefined,
        steps,
      });
      onCreated();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Nueva secuencia</h3>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <input
          type="text"
          placeholder="Nombre de la secuencia *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={lineId}
          onChange={(e) => setLineId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Linea WhatsApp *</option>
          {lines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.display_name} ({line.phone_number || line.instance_name})
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Nicho objetivo"
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="text"
          placeholder="Ciudad objetivo"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <select
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Cualquier temperatura</option>
          <option value="cold">FrÃ­o</option>
          <option value="warm">Caliente</option>
        </select>
      </div>

      <h4 className="text-sm font-medium text-gray-700 mb-2">Pasos de la secuencia</h4>
      <div className="space-y-3 mb-4">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg">
            <span className="text-xs font-bold text-gray-400 mt-2">#{step.step_order}</span>
            <select
              value={step.channel_id}
              onChange={(e) => updateStep(i, 'channel_id', e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-32"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="instagram_oficial">Instagram</option>
            </select>
            <textarea
              placeholder="Plantilla del mensaje (usa {{first_name}}, {{company_name}}...)"
              value={step.message_template}
              onChange={(e) => updateStep(i, 'message_template', e.target.value)}
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm min-h-[60px]"
            />
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={step.use_audio}
                  onChange={(e) => updateStep(i, 'use_audio', e.target.checked)}
                />
                Audio
              </label>
              <input
                type="number"
                value={step.delay_hours}
                onChange={(e) => updateStep(i, 'delay_hours', parseInt(e.target.value) || 0)}
                className="border border-gray-300 rounded px-2 py-1 text-xs w-16"
                title="Delay (horas)"
              />
              <select
                value={step.condition}
                onChange={(e) => updateStep(i, 'condition', e.target.value)}
                className="border border-gray-300 rounded px-1 py-1 text-xs"
              >
                <option value="always">Siempre</option>
                <option value="if_no_reply">Si no respondiÃ³</option>
                <option value="if_replied">Si respondiÃ³</option>
              </select>
            </div>
            {steps.length > 1 && (
              <button onClick={() => removeStep(i)} className="text-red-400 hover:text-red-600 text-xs mt-2">X</button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={addStep} className="text-sm text-blue-600 hover:text-blue-700">
          + Agregar paso
        </button>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {saving ? 'Guardando...' : 'Crear secuencia'}
          </button>
        </div>
      </div>
    </div>
  );
}
