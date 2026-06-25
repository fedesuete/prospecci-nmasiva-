const API_BASE = '/api';

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleUnauthorized() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    if (window.location.pathname !== '/login') window.location.href = '/login';
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...authHeaders(),
    ...(options.headers as Record<string, string>),
  };
  // Solo poner Content-Type json si hay body (sino Fastify rechaza POST vacíos)
  if (options.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    handleUnauthorized();
    throw new Error('Sesión expirada');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || res.statusText);
  }

  return res.json();
}

// Leads
export async function fetchLeads(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return apiFetch<{ data: any[]; count: number }>(`/leads?${query}`);
}

export async function fetchLeadDetail(id: string) {
  return apiFetch<any>(`/leads/${id}`);
}

export async function fetchLeadStats() {
  return apiFetch<Record<string, number>>('/leads/stats');
}

export async function updateLeadStatus(id: string, status: string) {
  return apiFetch<any>(`/leads/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function importCsv(formData: FormData) {
  const res = await fetch(`${API_BASE}/leads/import-csv`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  return res.json();
}

// Sequences
export async function fetchSequences() {
  return apiFetch<any[]>('/sequences');
}

export async function fetchSequenceDetail(id: string) {
  return apiFetch<any>(`/sequences/${id}`);
}

export async function createSequence(data: any) {
  return apiFetch<any>('/sequences', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Inbox
export async function fetchInbox(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return apiFetch<{ messages: any[]; total: number }>(`/inbox?${query}`);
}

export async function fetchConversations(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return apiFetch<any[]>(`/inbox/conversations${query ? `?${query}` : ''}`);
}

// WhatsApp Lines
export async function fetchWhatsAppLines() {
  return apiFetch<any[]>('/whatsapp-lines');
}

export async function toggleProspecting(id: string) {
  return apiFetch<any>(`/whatsapp-lines/${id}/toggle-prospecting`, { method: 'POST' });
}

export async function fetchProspectingStatus() {
  return apiFetch<any[]>('/whatsapp-lines/prospecting-status');
}

export async function updateWhatsAppLine(id: string, data: Record<string, any>) {
  return apiFetch<any>(`/whatsapp-lines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Evolution API Management
export async function fetchEvolutionInstances() {
  return apiFetch<any[]>('/evolution/instances');
}

export async function createWhatsAppLine(data: { instance_name: string; display_name: string; daily_limit?: number }) {
  return apiFetch<any>('/whatsapp-lines/create', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function importWhatsAppLine(data: { instance_name: string; display_name?: string; daily_limit?: number }) {
  return apiFetch<any>('/whatsapp-lines/import', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function connectWhatsAppLine(instanceName: string) {
  return apiFetch<{ qrcode: string | null; pairingCode: string | null }>(`/whatsapp-lines/${instanceName}/connect`);
}

export async function getWhatsAppLineStatus(instanceName: string) {
  return apiFetch<any>(`/whatsapp-lines/${instanceName}/status`);
}

export async function disconnectWhatsAppLine(instanceName: string) {
  return apiFetch<any>(`/whatsapp-lines/${instanceName}/disconnect`, { method: 'POST' });
}

export async function deleteWhatsAppLine(instanceName: string) {
  return apiFetch<any>(`/whatsapp-lines/${instanceName}`, { method: 'DELETE' });
}

export async function setupWhatsAppWebhook(instanceName: string) {
  return apiFetch<any>(`/whatsapp-lines/${instanceName}/webhook`, { method: 'POST' });
}

// Databases (banco de bases de datos)
export async function fetchDatabases() {
  return apiFetch<any[]>('/databases');
}

export async function uploadDatabase(formData: FormData) {
  const res = await fetch(`${API_BASE}/databases`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  return res.json();
}

export async function fetchRecommendations(count = 6) {
  return apiFetch<Array<{ rubro: string; zona: string; pais: string }>>(
    `/databases/recommendations?count=${count}`
  );
}

export async function generateDatabase(data: {
  rubro: string;
  zona: string;
  cantidad: number;
  solo_sin_web: boolean;
  todos_los_rubros?: boolean;
  radio_km?: number;
  pais?: string;
}) {
  return apiFetch<{
    database_id: string;
    name: string;
    encontrados: number;
    sin_web: number;
    con_telefono_valido: number;
    guardados: number;
    zonas_buscadas: number;
    objetivo: number;
    alcanzo_objetivo: boolean;
  }>('/databases/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function assignDatabase(id: string, lineId: string) {
  return apiFetch<any>(`/databases/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ line_id: lineId }),
  });
}

export async function deleteDatabase(id: string) {
  return apiFetch<any>(`/databases/${id}`, { method: 'DELETE' });
}

// Health check de lineas
export async function fetchLinesHealth() {
  return apiFetch<{ lines: any[]; alerts: any[]; checked_at: string }>('/whatsapp-lines/health');
}

// Audio Variants
export async function fetchAudioVariants(lineId?: string) {
  const params = lineId ? `?line_id=${lineId}` : '';
  return apiFetch<any[]>(`/audio-variants${params}`);
}

export async function uploadAudioVariant(formData: FormData) {
  const res = await fetch(`${API_BASE}/audio-variants`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  return res.json();
}

export async function deleteAudioVariant(id: string) {
  return apiFetch<any>(`/audio-variants/${id}`, { method: 'DELETE' });
}

// Sync chats
export async function syncChats(instanceName: string) {
  return apiFetch<any>(`/whatsapp-lines/${instanceName}/sync-chats`, { method: 'POST' });
}

// Messages
export async function sendWhatsApp(leadId: string, message: string, useAudio = false) {
  return apiFetch<any>('/messages/send-whatsapp', {
    method: 'POST',
    body: JSON.stringify({ lead_id: leadId, message, use_audio: useAudio }),
  });
}

export async function sendEmailMessage(leadId: string, subject: string, body: string) {
  return apiFetch<any>('/messages/send-email', {
    method: 'POST',
    body: JSON.stringify({ lead_id: leadId, subject, body }),
  });
}

export async function fetchLeadMessages(leadId: string) {
  return apiFetch<any[]>(`/leads/${leadId}/messages`);
}

// ============================================
// Inbox tipo chat (conversaciones + hilo + responder)
// ============================================
export async function fetchLinesSummary() {
  return apiFetch<Array<{ line_id: string; line_name: string; sin_responder: string; total: string }>>(
    '/inbox/lines-summary'
  );
}

export async function fetchThread(leadId: string) {
  return apiFetch<{ lead: any; line_id: string | null; messages: any[] }>(`/inbox/thread/${leadId}`);
}

export async function sendReply(leadId: string, message: string) {
  return apiFetch<{ success: boolean; error?: string }>(`/inbox/reply`, {
    method: 'POST',
    body: JSON.stringify({ lead_id: leadId, message }),
  });
}

// ============================================
// Usuarios / accesos (solo admin)
// ============================================
export interface PanelUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'agent';
  is_active: boolean;
  created_at: string;
  line_ids: string[];
  line_names: string[];
}

export async function fetchUsers() {
  return apiFetch<PanelUser[]>('/users');
}

export async function createUser(data: {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'agent';
  line_ids: string[];
}) {
  return apiFetch<{ id: string }>('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUser(
  id: string,
  data: { name?: string; password?: string; is_active?: boolean; line_ids?: string[] }
) {
  return apiFetch<{ ok: boolean }>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: string) {
  return apiFetch<{ ok: boolean }>(`/users/${id}`, { method: 'DELETE' });
}

export async function changeMyPassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ ok: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}
