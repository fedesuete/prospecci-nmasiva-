'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/sidebar';
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  fetchWhatsAppLines,
  type PanelUser,
} from '@/lib/api';
import { UserPlus, Trash2, Pencil, X, Loader2, ShieldCheck, User } from 'lucide-react';

interface Line {
  id: string;
  display_name: string;
}

const EMPTY_FORM = {
  id: '' as string | null,
  email: '',
  name: '',
  password: '',
  role: 'agent' as 'admin' | 'agent',
  line_ids: [] as string[],
  is_active: true,
};

export default function UsuariosPage() {
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([fetchUsers(), fetchWhatsAppLines()])
      .then(([u, l]) => {
        setUsers(u);
        setLines(l);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openNew = () => {
    setForm({ ...EMPTY_FORM });
    setError('');
    setShowForm(true);
  };

  const openEdit = (u: PanelUser) => {
    setForm({
      id: u.id,
      email: u.email,
      name: u.name,
      password: '',
      role: u.role,
      line_ids: u.line_ids,
      is_active: u.is_active,
    });
    setError('');
    setShowForm(true);
  };

  const toggleLine = (id: string) => {
    setForm((f) => ({
      ...f,
      line_ids: f.line_ids.includes(id)
        ? f.line_ids.filter((x) => x !== id)
        : [...f.line_ids, id],
    }));
  };

  const save = async () => {
    setError('');
    if (!form.name.trim()) return setError('El nombre es requerido');
    if (!form.id && !form.email.trim()) return setError('El email es requerido');
    if (!form.id && form.password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres');

    setSaving(true);
    try {
      if (form.id) {
        await updateUser(form.id, {
          name: form.name,
          is_active: form.is_active,
          line_ids: form.line_ids,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        await createUser({
          email: form.email.trim(),
          password: form.password,
          name: form.name,
          role: form.role,
          line_ids: form.line_ids,
        });
      }
      setShowForm(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u: PanelUser) => {
    if (!confirm(`¿Eliminar el acceso de ${u.name} (${u.email})?`)) return;
    try {
      await deleteUser(u.id);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Usuarios</h2>
            <p className="text-sm text-gray-500">Accesos al panel y líneas asignadas a cada empleado</p>
          </div>
          <button
            onClick={openNew}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <UserPlus size={16} /> Nuevo acceso
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Cargando...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No hay usuarios todavía</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Nombre</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Rol</th>
                  <th className="text-left px-4 py-3">Líneas</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                          u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {u.role === 'admin' ? <ShieldCheck size={12} /> : <User size={12} />}
                        {u.role === 'admin' ? 'Admin' : 'Empleado'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {u.line_names.length > 0 ? (
                        <span className="text-xs">{u.line_names.join(', ')}</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(u)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
                          <Pencil size={15} />
                        </button>
                        {u.role !== 'admin' && (
                          <button onClick={() => remove(u)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Modal de formulario */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">{form.id ? 'Editar acceso' : 'Nuevo acceso'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Nombre del empleado"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                  placeholder="empleado@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.id ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
                </label>
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              {!form.id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'agent' })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="agent">Empleado (solo Inbox de sus líneas)</option>
                    <option value="admin">Administrador (acceso total)</option>
                  </select>
                </div>
              )}

              {form.id && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  Acceso activo
                </label>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Líneas de WhatsApp asignadas
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {lines.length === 0 ? (
                    <p className="text-xs text-gray-400 p-2">No hay líneas configuradas</p>
                  ) : (
                    lines.map((l) => (
                      <label
                        key={l.id}
                        className="flex items-center gap-2 text-sm text-gray-700 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={form.line_ids.includes(l.id)}
                          onChange={() => toggleLine(l.id)}
                        />
                        {l.display_name}
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  El empleado verá y responderá solo los mensajes de estas líneas.
                </p>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg flex items-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {form.id ? 'Guardar' : 'Crear acceso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
