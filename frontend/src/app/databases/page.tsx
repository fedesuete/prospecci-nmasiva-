'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/sidebar';
import {
  fetchDatabases,
  uploadDatabase,
  assignDatabase,
  deleteDatabase,
  fetchWhatsAppLines,
  generateDatabase,
} from '@/lib/api';
import { Upload, Database, Trash2, CheckCircle, AlertCircle, ArrowRight, Sparkles, Loader2, X, MapPin } from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default function DatabasesPage() {
  const [databases, setDatabases] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<Record<string, string>>({});
  const [assignResult, setAssignResult] = useState<Record<string, any>>({});

  // Upload fields
  const [file, setFile] = useState<File | null>(null);
  const [dbName, setDbName] = useState('');
  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('');
  const [rubro, setRubro] = useState('');

  // Generador (Google Maps)
  const [showGen, setShowGen] = useState(false);
  const [genRubro, setGenRubro] = useState('');
  const [genZona, setGenZona] = useState('');
  const [genCantidad, setGenCantidad] = useState(50);
  const [genPais, setGenPais] = useState('PY');
  const [genSoloSinWeb, setGenSoloSinWeb] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  const [genError, setGenError] = useState('');

  const handleGenerate = async () => {
    setGenError('');
    if (!genRubro.trim() || !genZona.trim()) {
      setGenError('Completá el rubro y la zona');
      return;
    }
    setGenerating(true);
    setGenResult(null);
    try {
      const result = await generateDatabase({
        rubro: genRubro.trim(),
        zona: genZona.trim(),
        cantidad: genCantidad,
        solo_sin_web: genSoloSinWeb,
        pais: genPais,
      });
      setGenResult(result);
      loadData();
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetchDatabases().catch(() => []),
      fetchWhatsAppLines().catch(() => []),
    ]).then(([dbs, lns]) => {
      setDatabases(dbs);
      setLines(lns);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleUpload = async () => {
    if (!file) return alert('Selecciona un archivo CSV');
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', dbName || file.name.replace(/\.[^.]+$/, ''));
    if (niche) formData.append('niche', niche);
    if (city) formData.append('city', city);
    if (rubro) formData.append('rubro', rubro);

    try {
      await uploadDatabase(formData);
      setFile(null);
      setDbName('');
      setNiche('');
      setCity('');
      setRubro('');
      loadData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleAssign = async (dbId: string) => {
    const lineId = selectedLine[dbId];
    if (!lineId) return alert('Selecciona una linea');
    setAssigningId(dbId);

    try {
      const result = await assignDatabase(dbId, lineId);
      setAssignResult({ ...assignResult, [dbId]: result });
      loadData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setAssigningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar esta base de datos?')) return;
    await deleteDatabase(id);
    loadData();
  };

  const pending = databases.filter(db => !db.imported_at);
  const imported = databases.filter(db => db.imported_at);

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Bases de Datos</h2>
          <button
            onClick={() => { setShowGen(true); setGenResult(null); setGenError(''); }}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Sparkles size={16} /> Generar base de datos
          </button>
        </div>

        {/* Upload */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Subir nueva base</h3>

          <label className="block border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition-colors mb-4">
            <Upload size={28} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-600">
              {file ? (
                <span className="text-blue-600 font-medium">{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
              ) : (
                <>Click para seleccionar CSV</>
              )}
            </p>
            <input type="file" accept=".csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>

          {file && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <input
                  type="text"
                  placeholder="Nombre de la base"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Nicho (ej: gastronomia)"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Ciudad"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Rubro"
                  value={rubro}
                  onChange={(e) => setRubro(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {uploading ? 'Subiendo...' : 'Subir base de datos'}
              </button>
            </>
          )}
        </div>

        {/* Bases sin asignar */}
        {pending.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Sin asignar ({pending.length})</h3>
            <div className="space-y-3">
              {pending.map((db) => (
                <div key={db.id} className="bg-white rounded-xl shadow-sm border border-yellow-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                        <Database size={18} className="text-yellow-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{db.name}</h4>
                        <p className="text-xs text-gray-500">
                          {db.file_name} - {db.total_rows} filas - {db.valid_phones} telefonos validos
                          {db.default_niche && ` - Nicho: ${db.default_niche}`}
                          {db.default_city && ` - Ciudad: ${db.default_city}`}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => handleDelete(db.id)} className="text-red-400 hover:text-red-600 p-2">
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Asignar a línea */}
                  <div className="flex gap-2 items-center">
                    <select
                      value={selectedLine[db.id] ?? ''}
                      onChange={(e) => setSelectedLine({ ...selectedLine, [db.id]: e.target.value })}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Seleccionar linea...</option>
                      {lines.map((line) => (
                        <option key={line.id} value={line.id}>
                          {line.display_name} ({line.phone_number || line.instance_name}) - {line.status}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAssign(db.id)}
                      disabled={assigningId === db.id || !selectedLine[db.id]}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1 text-sm whitespace-nowrap"
                    >
                      <ArrowRight size={14} />
                      {assigningId === db.id ? 'Importando...' : 'Asignar e importar'}
                    </button>
                  </div>

                  {/* Resultado de asignación */}
                  {assignResult[db.id] && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg text-sm">
                      <div className="flex items-center gap-1 text-green-700 font-medium mb-1">
                        <CheckCircle size={14} /> Importado
                      </div>
                      <span className="text-green-600">{assignResult[db.id].imported} nuevos</span>
                      {' - '}
                      <span className="text-blue-600">{assignResult[db.id].updated} actualizados</span>
                      {assignResult[db.id].already_contacted > 0 && (
                        <>
                          {' - '}
                          <span className="text-orange-600 font-medium">{assignResult[db.id].already_contacted} ya contactados (protegidos)</span>
                        </>
                      )}
                      {' - '}
                      <span className="text-gray-500">{assignResult[db.id].skipped} omitidos</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bases ya importadas */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Importadas ({imported.length})</h3>
          {imported.length === 0 && pending.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500">
              <Database size={48} className="mx-auto mb-4 text-gray-300" />
              <p>No hay bases de datos</p>
              <p className="text-sm mt-1">Subi CSVs y despues asignalos a una linea de WhatsApp</p>
            </div>
          ) : (
            <div className="space-y-3">
              {imported.map((db) => {
                const result = typeof db.import_result === 'string' ? JSON.parse(db.import_result) : db.import_result;
                return (
                  <div key={db.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <CheckCircle size={18} className="text-green-600" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900">{db.name}</h4>
                          <p className="text-xs text-gray-500">
                            Asignada a: <span className="font-medium text-blue-600">{db.line_name}</span>
                            {' - '}{db.total_rows} filas
                            {result && <> - {result.imported} importados, {result.updated} actualizados</>}
                            {' - '}Importada {formatDate(db.imported_at)}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => handleDelete(db.id)} className="text-red-400 hover:text-red-600 p-2">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Modal: Generar base de datos desde Google Maps */}
      {showGen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-purple-600" />
                <h3 className="font-bold text-gray-900">Generar base de datos</h3>
              </div>
              <button onClick={() => setShowGen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500">
                Busca negocios reales en Google Maps y crea una base lista para asignar a una línea.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rubro</label>
                <input
                  value={genRubro}
                  onChange={(e) => setGenRubro(e.target.value)}
                  placeholder="ej: peluquerías, restaurantes, gimnasios"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zona / ciudad</label>
                <input
                  value={genZona}
                  onChange={(e) => setGenZona(e.target.value)}
                  placeholder="ej: Asunción, Encarnación"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={genCantidad}
                    onChange={(e) => setGenCantidad(parseInt(e.target.value) || 50)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">País</label>
                  <select
                    value={genPais}
                    onChange={(e) => setGenPais(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="PY">Paraguay</option>
                    <option value="AR">Argentina</option>
                    <option value="UY">Uruguay</option>
                    <option value="BO">Bolivia</option>
                    <option value="BR">Brasil</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={genSoloSinWeb}
                  onChange={(e) => setGenSoloSinWeb(e.target.checked)}
                />
                <span>Solo negocios <strong>SIN página web</strong> (recomendado)</span>
              </label>

              {genError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {genError}
                </div>
              )}

              {genResult && (
                <div className="text-sm bg-green-50 border border-green-100 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-1 text-green-700 font-medium">
                    <CheckCircle size={14} /> Base creada: {genResult.name}
                  </div>
                  <div className="text-gray-600 text-xs">
                    {genResult.encontrados} encontrados · {genResult.sin_web} sin web ·{' '}
                    <strong>{genResult.guardados} guardados</strong> (con teléfono válido)
                  </div>
                  <div className="text-gray-500 text-xs">
                    Ya aparece abajo en "Sin asignar" para que la asignes a una línea.
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
              <button
                onClick={() => setShowGen(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cerrar
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-4 py-2 text-sm bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 disabled:opacity-60 text-white rounded-lg flex items-center gap-2"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                {generating ? 'Buscando en Google Maps...' : 'Generar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
