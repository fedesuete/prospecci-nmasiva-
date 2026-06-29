'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '@/components/sidebar';
import {
  fetchWhatsAppLines,
  fetchEvolutionInstances,
  createWhatsAppLine,
  importWhatsAppLine,
  connectWhatsAppLine,
  getWhatsAppLineStatus,
  disconnectWhatsAppLine,
  deleteWhatsAppLine,
  setupWhatsAppWebhook,
  updateWhatsAppLine,
  toggleProspecting,
  fetchProspectingStatus,
} from '@/lib/api';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Phone, Wifi, WifiOff, AlertTriangle, Plus, QrCode, RefreshCw, Trash2, Link as LinkIcon, Download, Settings, Play, Pause, AlertCircle } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Conectada', color: 'bg-green-100 text-green-700' },
  warming_up: { label: 'Calentando', color: 'bg-yellow-100 text-yellow-700' },
  paused: { label: 'Desconectada', color: 'bg-gray-100 text-gray-600' },
  banned: { label: 'Baneada', color: 'bg-red-100 text-red-700' },
};

export default function WhatsAppPage() {
  const { user } = useAuth();
  const isAdmin = user?.role !== 'agent';
  const [lines, setLines] = useState<any[]>([]);
  const [evoInstances, setEvoInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [qrData, setQrData] = useState<{ instanceName: string; qrcode: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editLine, setEditLine] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prospData, evoData] = await Promise.all([
        fetchProspectingStatus().catch(() => []),
        fetchEvolutionInstances().catch(() => []),
      ]);
      setLines(prospData);
      setEvoInstances(Array.isArray(evoData) ? evoData : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Instancias en Evolution que NO estan registradas en nuestra DB
  const unregistered = evoInstances.filter(
    (evo) => !lines.some((l) => l.instance_name === evo.name)
  );

  const handleConnect = async (instanceName: string) => {
    setActionLoading(instanceName);
    try {
      const result = await connectWhatsAppLine(instanceName);
      if (result.qrcode) {
        setQrData({ instanceName, qrcode: result.qrcode });
      } else {
        alert('No se pudo generar QR. La instancia puede ya estar conectada.');
        await loadData();
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckStatus = async (instanceName: string) => {
    setActionLoading(instanceName);
    try {
      const result = await getWhatsAppLineStatus(instanceName);
      const state = result.state || result.instance?.state || 'unknown';
      await loadData();
      if (state === 'open') {
        alert('✅ Conectada correctamente');
      } else if (state === 'close') {
        alert('❌ Desconectada. Usá el botón "Conectar (QR)" / "Reconectar (QR)" para volver a vincularla.');
      } else if (state === 'connecting') {
        alert('⏳ Conectando... esperá unos segundos y volvé a tocar "Estado".');
      } else {
        alert(`Estado: ${state}`);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetupWebhook = async (instanceName: string) => {
    setActionLoading(instanceName);
    try {
      await setupWhatsAppWebhook(instanceName);
      alert('Webhook configurado correctamente');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (instanceName: string) => {
    if (!confirm('Desconectar esta linea?')) return;
    setActionLoading(instanceName);
    try {
      await disconnectWhatsAppLine(instanceName);
      await loadData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (instanceName: string) => {
    if (!confirm('Eliminar esta linea? Se borra de Evolution API y de nuestra DB.')) return;
    setActionLoading(instanceName);
    try {
      await deleteWhatsAppLine(instanceName);
      await loadData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleImport = async (instanceName: string, displayName?: string) => {
    setActionLoading(instanceName);
    try {
      await importWhatsAppLine({ instance_name: instanceName, display_name: displayName });
      setShowImport(false);
      await loadData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const totalCapacity = lines.reduce((sum, l) => sum + l.daily_limit, 0);
  const totalSent = lines.reduce((sum, l) => sum + l.sent_today, 0);
  const activeCount = lines.filter(l => l.status === 'active' || l.status === 'warming_up').length;

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 pt-16 md:pt-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Lineas WhatsApp</h2>
          <div className="flex gap-2">
            <button
              onClick={() => loadData()}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm flex items-center gap-1 hover:bg-gray-50"
            >
              <RefreshCw size={14} /> Actualizar
            </button>
            {isAdmin && unregistered.length > 0 && (
              <button
                onClick={() => setShowImport(!showImport)}
                className="px-3 py-2 border border-blue-300 text-blue-700 rounded-lg text-sm flex items-center gap-1 hover:bg-blue-50"
              >
                <Download size={14} /> Importar existente ({unregistered.length})
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
              >
                <Plus size={16} /> Nueva linea
              </button>
            )}
          </div>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <p className="text-sm text-gray-500">Lineas activas</p>
            <p className="text-3xl font-bold text-gray-900">{activeCount} / {lines.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <p className="text-sm text-gray-500">Enviados hoy</p>
            <p className="text-3xl font-bold text-gray-900">{totalSent}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <p className="text-sm text-gray-500">Capacidad restante</p>
            <p className="text-3xl font-bold text-gray-900">{totalCapacity - totalSent}</p>
          </div>
        </div>

        {/* Modal QR Code */}
        {qrData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setQrData(null)}>
            <div className="bg-white rounded-2xl p-8 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">Escanea el QR</h3>
              <p className="text-sm text-gray-500 text-center mb-4">
                Abri WhatsApp en el celular → Dispositivos vinculados → Vincular dispositivo
              </p>
              <div className="flex justify-center mb-4">
                <img src={qrData.qrcode} alt="QR Code" className="w-64 h-64" />
              </div>
              <p className="text-xs text-gray-400 text-center mb-4">
                Instancia: {qrData.instanceName} — El QR expira en ~45 segundos
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleConnect(qrData.instanceName)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  Regenerar QR
                </button>
                <button
                  onClick={async () => {
                    setQrData(null);
                    await handleCheckStatus(qrData.instanceName);
                  }}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"
                >
                  Ya escanee
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Form crear nueva instancia */}
        {showCreate && (
          <CreateLineForm
            onCreated={async (result) => {
              setShowCreate(false);
              if (result.qrcode) {
                setQrData({ instanceName: result.line.instance_name, qrcode: result.qrcode });
              }
              await loadData();
            }}
            onCancel={() => setShowCreate(false)}
          />
        )}

        {/* Importar instancia existente */}
        {showImport && unregistered.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Instancias en Evolution API sin registrar</h3>
            <p className="text-sm text-gray-500 mb-4">Estas instancias ya existen en Evolution API pero no estan en nuestro sistema. Importalas para gestionarlas desde aca.</p>
            <div className="space-y-3">
              {unregistered.map((evo) => (
                <div key={evo.name} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{evo.name}</p>
                    <p className="text-xs text-gray-500">
                      {evo.profileName ?? 'Sin perfil'} · {evo.ownerJid?.split('@')[0] || 'Sin numero'} ·
                      <span className={evo.connectionStatus === 'open' ? 'text-green-600' : 'text-red-500'}>
                        {' '}{evo.connectionStatus === 'open' ? 'Conectada' : 'Desconectada'}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleImport(evo.name, evo.profileName)}
                    disabled={actionLoading === evo.name}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {actionLoading === evo.name ? 'Importando...' : 'Importar'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista de lineas */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-gray-500">Cargando...</div>
          ) : lines.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
              <Phone size={48} className="mx-auto mb-4 text-gray-300" />
              <p>No hay lineas configuradas</p>
              <p className="text-sm mt-1">Crea una nueva o importa una existente de Evolution API</p>
            </div>
          ) : (
            lines.map((line) => {
              const config = STATUS_CONFIG[line.status] ?? STATUS_CONFIG.paused;
              const usagePercent = line.daily_limit > 0 ? Math.round((line.sent_today / line.daily_limit) * 100) : 0;
              const isLoading = actionLoading === line.instance_name;

              return (
                <div key={line.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Phone size={18} className="text-green-600" />
                      </div>
                      <div>
                        <Link href={`/whatsapp/${line.id}`} className="font-semibold text-gray-900 hover:text-blue-600">{line.display_name}</Link>
                        <p className="text-xs text-gray-500 font-mono">
                          {line.phone_number || 'Sin numero'} · {line.instance_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Boton prospeccion ON/OFF */}
                      <button
                        onClick={async () => {
                          try {
                            const updated = await toggleProspecting(line.id);
                            // Actualizacion instantanea sin recargar toda la pagina
                            setLines((prev) =>
                              prev.map((l) =>
                                l.id === line.id ? { ...l, prospecting_active: updated.prospecting_active } : l
                              )
                            );
                          } catch (err) {
                            alert('No se pudo cambiar la prospección: ' + (err as Error).message);
                          }
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                          line.prospecting_active
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                      >
                        {line.prospecting_active ? <Play size={12} /> : <Pause size={12} />}
                        {line.prospecting_active ? 'PROSPECTANDO' : 'INACTIVA'}
                      </button>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                        {config.label}
                      </span>
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{line.sent_today} enviados hoy</span>
                      <span>Limite: {line.daily_limit}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(usagePercent, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Alertas */}
                  {line.prospecting_active && line.leads_pendientes !== undefined && line.leads_pendientes === 0 && (
                    <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded-lg mb-3">
                      <AlertCircle size={14} className="text-orange-600" />
                      <span className="text-xs text-orange-700 font-medium">Sin leads pendientes - necesita nueva base de datos</span>
                    </div>
                  )}
                  {line.prospecting_active && line.audios_count !== undefined && line.audios_count === 0 && (
                    <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg mb-3">
                      <AlertCircle size={14} className="text-red-600" />
                      <span className="text-xs text-red-700 font-medium">Sin audios configurados - subi audios desde el detalle de la linea</span>
                    </div>
                  )}

                  {/* Stats de prospeccion */}
                  {line.leads_pendientes !== undefined && (
                    <div className="flex gap-4 text-xs text-gray-500 mb-3">
                      <span className="font-medium">{line.leads_pendientes} leads pendientes</span>
                      <span>{line.audios_count ?? 0} audios</span>
                    </div>
                  )}

                  {/* Config info */}
                  <div className="flex gap-3 text-xs text-gray-500 mb-3">
                    <span>Horario: {line.send_hour_start ?? 9}:00 - {line.send_hour_end ?? 19}:00</span>
                    <span>Dias: {(line.send_days ?? ['lun','mar','mie','jue','vie']).join(', ')}</span>
                    <span>Delay: {Math.round((line.delay_min_seconds ?? 210) / 60)}-{Math.round((line.delay_max_seconds ?? 270) / 60)} min</span>
                  </div>

                  {line.status === 'warming_up' && line.warmup_start_date && (
                    <p className="text-xs text-yellow-600 mb-3">
                      En calentamiento desde {line.warmup_start_date} · +{line.warmup_daily_increment}/dia
                    </p>
                  )}

                  {/* Acciones */}
                  <div className="flex gap-2 flex-wrap">
                    {isAdmin && (
                      <button
                        onClick={() => setEditLine(line)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg text-xs hover:bg-gray-100"
                      >
                        <Settings size={14} /> Configurar
                      </button>
                    )}
                    {(line.status === 'paused' || line.status === 'warming_up' || line.status === 'banned') && (
                      <button
                        onClick={() => handleConnect(line.instance_name)}
                        disabled={isLoading}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs hover:bg-green-100 disabled:opacity-50"
                      >
                        <QrCode size={14} /> {isLoading ? 'Cargando...' : (line.status === 'banned' ? 'Reconectar (QR)' : 'Conectar (QR)')}
                      </button>
                    )}
                    <button
                      onClick={() => handleCheckStatus(line.instance_name)}
                      disabled={isLoading}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs hover:bg-blue-100 disabled:opacity-50"
                    >
                      <RefreshCw size={14} /> Estado
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => handleSetupWebhook(line.instance_name)}
                          disabled={isLoading}
                          className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs hover:bg-purple-100 disabled:opacity-50"
                        >
                          <LinkIcon size={14} /> Config Webhook
                        </button>
                        {line.status === 'active' && (
                          <button
                            onClick={() => handleDisconnect(line.instance_name)}
                            disabled={isLoading}
                            className="flex items-center gap-1 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-xs hover:bg-orange-100 disabled:opacity-50"
                          >
                            <WifiOff size={14} /> Desconectar
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(line.instance_name)}
                          disabled={isLoading}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 size={14} /> Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal editar linea */}
        {editLine && (
          <EditLineModal
            line={editLine}
            onSave={async (data) => {
              await updateWhatsAppLine(editLine.id, data);
              setEditLine(null);
              loadData();
            }}
            onClose={() => setEditLine(null)}
          />
        )}
      </main>
    </div>
  );
}

function EditLineModal({
  line,
  onSave,
  onClose,
}: {
  line: any;
  onSave: (data: Record<string, any>) => Promise<void>;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(line.display_name);
  const [dailyLimit, setDailyLimit] = useState(line.daily_limit);
  const [status, setStatus] = useState(line.status);
  const [hourStart, setHourStart] = useState(line.send_hour_start ?? 9);
  const [hourEnd, setHourEnd] = useState(line.send_hour_end ?? 19);
  const [delayMin, setDelayMin] = useState(line.delay_min_seconds ?? 210);
  const [delayMax, setDelayMax] = useState(line.delay_max_seconds ?? 270);
  const [sendDays, setSendDays] = useState<string[]>(line.send_days ?? ['lun','mar','mie','jue','vie']);
  const [saving, setSaving] = useState(false);

  const allDays = [
    { key: 'lun', label: 'Lun' },
    { key: 'mar', label: 'Mar' },
    { key: 'mie', label: 'Mie' },
    { key: 'jue', label: 'Jue' },
    { key: 'vie', label: 'Vie' },
    { key: 'sab', label: 'Sab' },
    { key: 'dom', label: 'Dom' },
  ];

  const toggleDay = (day: string) => {
    setSendDays(sendDays.includes(day)
      ? sendDays.filter(d => d !== day)
      : [...sendDays, day]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        display_name: displayName,
        daily_limit: dailyLimit,
        status,
        send_hour_start: hourStart,
        send_hour_end: hourEnd,
        send_days: sendDays,
        delay_min_seconds: delayMin,
        delay_max_seconds: delayMax,
      });
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-4">Configurar: {line.display_name}</h3>
        <p className="text-xs text-gray-500 mb-4 font-mono">{line.phone_number} · {line.instance_name}</p>

        <div className="space-y-4">
          {/* Nombre y estado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Nombre</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="active">Activa</option>
                <option value="warming_up">Calentando</option>
                <option value="paused">Pausada</option>
                <option value="banned">Baneada</option>
              </select>
            </div>
          </div>

          {/* Limite diario */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Limite diario de mensajes</label>
            <input
              type="number"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(parseInt(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Horario */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Hora inicio</label>
              <select
                value={hourStart}
                onChange={(e) => setHourStart(parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{i}:00</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Hora fin</label>
              <select
                value={hourEnd}
                onChange={(e) => setHourEnd(parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{i}:00</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dias */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Dias de envio</label>
            <div className="flex gap-2">
              {allDays.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => toggleDay(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    sendDays.includes(key)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Delay entre mensajes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Delay minimo (segundos)</label>
              <input
                type="number"
                value={delayMin}
                onChange={(e) => setDelayMin(parseInt(e.target.value) || 60)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-400 mt-0.5">{Math.round(delayMin / 60)} min</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Delay maximo (segundos)</label>
              <input
                type="number"
                value={delayMax}
                onChange={(e) => setDelayMax(parseInt(e.target.value) || 120)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-400 mt-0.5">{Math.round(delayMax / 60)} min</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateLineForm({
  onCreated,
  onCancel,
}: {
  onCreated: (result: any) => void;
  onCancel: () => void;
}) {
  const [instanceName, setInstanceName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dailyLimit, setDailyLimit] = useState(80);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!instanceName.trim()) return alert('Nombre de instancia requerido');
    setSaving(true);
    try {
      const result = await createWhatsAppLine({
        instance_name: instanceName.trim(),
        display_name: displayName.trim() || instanceName.trim(),
        daily_limit: dailyLimit,
      });
      onCreated(result);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Nueva linea WhatsApp</h3>
      <p className="text-sm text-gray-500 mb-4">
        Se crea una nueva instancia en Evolution API y se genera un QR code para vincular el numero.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Nombre instancia *</label>
          <input
            type="text"
            placeholder="Ej: linea-ventas-1"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value.replace(/\s/g, '-'))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Nombre para mostrar</label>
          <input
            type="text"
            placeholder="Ej: Linea Ventas 1"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Limite diario</label>
          <input
            type="number"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(parseInt(e.target.value) || 80)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {saving ? 'Creando...' : 'Crear y generar QR'}
        </button>
      </div>
    </div>
  );
}
