const API_BASE = '/api';
const API_KEY = 'prospeccion-api-key-2026';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...options.headers,
    },
  });

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
    headers: { 'x-api-key': API_KEY },
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

export async function fetchConversations() {
  return apiFetch<any[]>('/inbox/conversations');
}

// WhatsApp Lines
export async function fetchWhatsAppLines() {
  return apiFetch<any[]>('/whatsapp-lines');
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
    headers: { 'x-api-key': API_KEY },
    body: formData,
  });
  return res.json();
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
    headers: { 'x-api-key': API_KEY },
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
