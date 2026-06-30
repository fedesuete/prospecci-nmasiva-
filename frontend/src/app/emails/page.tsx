'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/sidebar';
import {
  fetchEmailAccounts, createEmailAccount, updateEmailAccount,
  deleteEmailAccount, testEmailAccount, type EmailAccount,
} from '@/lib/api';
import { Mail, Plus, Trash2, X, Loader2, Send, Power } from 'lucide-react';

const EMPTY = {
  id: '' as string | null,
  name: '', smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_user: '', smtp_pass: '',
  from_name: '', daily_limit: 30, warmup_daily_increment: 5, is_active: true,
};

export default function EmailsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchEmailAccounts().then(setAccounts).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openNew = () => { setForm({ ...EMPTY }); setError(''); setShowForm(true); };

  const save = async () => {
    setError('');
    if (!form.name.trim() || !form.smtp_host.trim() || !form.smtp_user.trim()) {
      return setError('Completá nombre, host y email');
    }
    if (!form.id && !form.smtp_pass.trim()) return setError('Falta la contraseña');
    setSaving(true);
    try {
      const data: Record<string, any> = {
        name: form.name, smtp_host: form.smtp_host, smtp_port: form.smtp_port,
        smtp_user: form.smtp_user, from_name: form.from_name,
        daily_limit: form.daily_limit, warmup_daily_increment: form.warmup_daily_increment,
      };
      if (form.smtp_pass.trim()) data.smtp_pass = form.smtp_pass;
      if (form.id) await updateEmailAccount(form.id, data);
      else await createEmailAccount(data);
      setShowForm(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (a: EmailAccount) => {
    await updateEmailAccount(a.id, { is_active: !a.is_active });
    load();
  };

  const remove = async (a: EmailAccount) => {
    if (!confirm(`¿Eliminar la casilla ${a.smtp_user}?`)) return;
    await deleteEmailAccount(a.id);
    load();
  };

  const test = async (a: EmailAccount) => {
    setTesting(a.id);
    try {
      const r = await testEmailAccount(a.id);
      if (r.ok) alert(`✅ Email de prueba enviado a ${r.to}. Revisá la bandeja.`);
      else alert(`❌ Error: ${r.error}`);
    } catch (e) {
      alert('❌ ' + (e as Error).message);
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 pt-16 md:pt-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Casillas de Email</h2>
            <p className="text-sm text-gray-500">El sistema rota entre las casillas y respeta el límite diario de cada una (anti-bloqueo)</p>
          </div>
          <button onClick={openNew} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2">
            <Plus size={16} /> Nueva casilla
          </button>
        </div>

        {/* Total de envíos disponibles hoy */}
        {accounts.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 text-sm text-blue-800">
            Capacidad de hoy: <strong>{accounts.filter(a => a.is_active).reduce((s, a) => s + Math.max(0, a.daily_limit - a.sent_today), 0)}</strong> emails ·{' '}
            {accounts.filter(a => a.is_active).length} casilla(s) activa(s)
          </div>
        )}

        {loading ? (
          <div className="text-gray-500">Cargando...</div>
        ) : accounts.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
            <Mail size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No hay casillas configuradas</p>
            <p className="text-sm mt-1">Agregá una (ej: un Gmail con contraseña de aplicación) para enviar emails desde los flujos</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {accounts.map((a) => (
              <div key={a.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{a.name}</h3>
                    <p className="text-xs text-gray-500 truncate">{a.smtp_user}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                    {a.is_active ? 'Activa' : 'Pausada'}
                  </span>
                </div>
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Enviados hoy</span>
                    <span>{a.sent_today} / {a.daily_limit}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (a.sent_today / a.daily_limit) * 100)}%` }} />
                  </div>
                  {a.warmup_daily_increment > 0 && (
                    <p className="text-[10px] text-gray-400 mt-1">Calentamiento: +{a.warmup_daily_increment}/día</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setForm({ ...EMPTY, ...a, smtp_pass: '', from_name: a.from_name ?? '' }); setError(''); setShowForm(true); }} className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">Editar</button>
                  <button onClick={() => test(a)} disabled={testing === a.id} className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-1 disabled:opacity-50">
                    {testing === a.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Probar
                  </button>
                  <button onClick={() => toggle(a)} className="px-2 py-1.5 text-gray-400 hover:text-gray-700" title={a.is_active ? 'Pausar' : 'Activar'}><Power size={15} /></button>
                  <button onClick={() => remove(a)} className="px-2 py-1.5 text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">{form.id ? 'Editar casilla' : 'Nueva casilla'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre (referencia)</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ej: Ventas 1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Servidor SMTP</label>
                  <input value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Puerto</label>
                  <input type="number" value={form.smtp_port} onChange={(e) => setForm({ ...form, smtp_port: parseInt(e.target.value) || 587 })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (usuario)</label>
                <input value={form.smtp_user} onChange={(e) => setForm({ ...form, smtp_user: e.target.value })} placeholder="tu@gmail.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña {form.id && <span className="text-gray-400 font-normal">(vacío = no cambiar)</span>}
                </label>
                <input type="text" value={form.smtp_pass} onChange={(e) => setForm({ ...form, smtp_pass: e.target.value })} placeholder="contraseña de aplicación" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del remitente</label>
                <input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} placeholder="ej: Juan de Ventas" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Límite diario</label>
                  <input type="number" value={form.daily_limit} onChange={(e) => setForm({ ...form, daily_limit: parseInt(e.target.value) || 30 })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Calentar +X/día</label>
                  <input type="number" value={form.warmup_daily_increment} onChange={(e) => setForm({ ...form, warmup_daily_increment: parseInt(e.target.value) || 0 })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
