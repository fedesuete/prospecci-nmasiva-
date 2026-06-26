'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/sidebar';
import { importCsv, fetchWhatsAppLines } from '@/lib/api';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('');
  const [rubro, setRubro] = useState('');
  const [temperature, setTemperature] = useState('cold');
  const [lineId, setLineId] = useState('');
  const [lines, setLines] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    fetchWhatsAppLines().then(setLines).catch(() => {});
  }, []);

  const handleImport = async () => {
    if (!file) return alert('Selecciona un archivo CSV');

    setImporting(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('source_name', sourceName || file.name);
    formData.append('filename', file.name);
    formData.append('temperature', temperature);
    if (niche) formData.append('niche', niche);
    if (city) formData.append('city', city);
    if (rubro) formData.append('rubro', rubro);
    if (lineId) formData.append('line_id', lineId);

    try {
      const res = await importCsv(formData);
      setResult(res);
    } catch (err) {
      setResult({ error: (err as Error).message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 pt-16 md:pt-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Importar Leads desde CSV</h2>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
          {/* Zona de drop del archivo */}
          <div className="mb-6">
            <label className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 transition-colors">
              <Upload size={32} className="mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-600">
                {file ? (
                  <span className="text-blue-600 font-medium">{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                ) : (
                  <>Click para seleccionar archivo CSV</>
                )}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Columnas: nombre/first_name, telefono/phone, email, empresa/company, instagram, nicho/niche, ciudad/city, rubro
              </p>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {/* Campos opcionales */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Nombre de la fuente</label>
              <input
                type="text"
                placeholder="Ej: CSV textiles CABA junio"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Temperatura</label>
              <select
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="cold">Frio (scrapeado)</option>
                <option value="warm">Caliente (opt-in)</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 block mb-1">Linea WhatsApp asignada</label>
              <select
                value={lineId}
                onChange={(e) => setLineId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Sin asignar (round-robin)</option>
                {lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.display_name} ({line.phone_number || line.instance_name}) - {line.status}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Asigna una linea para que solo esa linea contacte a estos leads. Evita que se pisen entre lineas.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Nicho (default)</label>
              <input
                type="text"
                placeholder="Ej: textil"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Ciudad (default)</label>
              <input
                type="text"
                placeholder="Ej: Buenos Aires"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-500 block mb-1">Rubro (default)</label>
              <input
                type="text"
                placeholder="Ej: fabrica de remeras"
                value={rubro}
                onChange={(e) => setRubro(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
          >
            {importing ? 'Importando...' : 'Importar CSV'}
          </button>

          {/* Resultado */}
          {result && !result.error && (
            <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={18} className="text-green-600" />
                <span className="font-medium text-green-800">Importacion completada</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-sm">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-900">{result.total}</div>
                  <div className="text-xs text-gray-500">Total filas</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{result.imported}</div>
                  <div className="text-xs text-gray-500">Nuevos</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-600">{result.updated}</div>
                  <div className="text-xs text-gray-500">Actualizados</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600">{result.skipped}</div>
                  <div className="text-xs text-gray-500">Omitidos</div>
                </div>
              </div>
              {result.errors?.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-gray-500 cursor-pointer">
                    {result.errors.length} advertencias/errores
                  </summary>
                  <div className="mt-2 max-h-40 overflow-y-auto text-xs text-gray-600 space-y-1">
                    {result.errors.map((err: any, i: number) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-gray-400">Fila {err.row}:</span>
                        <span>{err.reasons.join(', ')}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {result?.error && (
            <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center gap-2">
                <AlertCircle size={18} className="text-red-600" />
                <span className="font-medium text-red-800">Error: {result.error}</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
