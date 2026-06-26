'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { fetchLeads, updateLeadStatus, fetchWhatsAppLines } from '@/lib/api';
import { PIPELINE_LABELS, PIPELINE_COLORS, TEMP_LABELS, formatDate } from '@/lib/utils';

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [lines, setLines] = useState<any[]>([]);
  const limit = 25;

  useEffect(() => { fetchWhatsAppLines().then(setLines).catch(() => {}); }, []);

  const loadLeads = () => {
    setLoading(true);
    fetchLeads({ ...filters, limit: String(limit), offset: String(page * limit) })
      .then((res) => {
        setLeads(res.data);
        setCount(res.count);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadLeads(); }, [page, filters]);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateLeadStatus(id, status);
      loadLeads();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 pt-16 md:pt-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Leads ({count})</h2>
        </div>

        {/* Filtros */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={filters.status ?? ''}
            onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(0); }}
          >
            <option value="">Todos los estados</option>
            {Object.entries(PIPELINE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={filters.temperature ?? ''}
            onChange={(e) => { setFilters({ ...filters, temperature: e.target.value }); setPage(0); }}
          >
            <option value="">Temperatura</option>
            <option value="cold">FrÃ­o</option>
            <option value="warm">Caliente</option>
          </select>
          <input
            type="text"
            placeholder="Filtrar por nicho..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={filters.niche ?? ''}
            onChange={(e) => { setFilters({ ...filters, niche: e.target.value }); setPage(0); }}
          />
          <input
            type="text"
            placeholder="Filtrar por ciudad..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={filters.city ?? ''}
            onChange={(e) => { setFilters({ ...filters, city: e.target.value }); setPage(0); }}
          />
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={filters.line_id ?? ''}
            onChange={(e) => { setFilters({ ...filters, line_id: e.target.value }); setPage(0); }}
          >
            <option value="">Todas las lineas</option>
            {lines.map((line) => (
              <option key={line.id} value={line.id}>{line.display_name}</option>
            ))}
          </select>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">TelÃ©fono</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Nicho</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Ciudad</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Temp.</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Cargando...</td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No hay leads</td></tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/leads/${lead.id}`} className="text-blue-600 hover:underline font-medium">
                        {lead.first_name} {lead.last_name ?? ''}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{lead.company_name ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{lead.phone}</td>
                    <td className="px-4 py-3 text-gray-600">{lead.niche ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{lead.city ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${lead.temperature === 'warm' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {TEMP_LABELS[lead.temperature] ?? lead.temperature}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PIPELINE_COLORS[lead.pipeline_status]}`}>
                        {PIPELINE_LABELS[lead.pipeline_status] ?? lead.pipeline_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(lead.created_at)}</td>
                    <td className="px-4 py-3">
                      <select
                        className="border border-gray-200 rounded px-2 py-1 text-xs"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) handleStatusChange(lead.id, e.target.value);
                        }}
                      >
                        <option value="">Mover a...</option>
                        {Object.entries(PIPELINE_LABELS).map(([k, v]) => (
                          <option key={k} value={k} disabled={k === lead.pipeline_status}>{v}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PaginaciÃ³n */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">
            {page * limit + 1}-{Math.min((page + 1) * limit, count)} de {count}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={(page + 1) * limit >= count}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
