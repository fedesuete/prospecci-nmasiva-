import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PIPELINE_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  respondio: 'Respondió',
  calificado: 'Calificado',
  agendado: 'Agendado',
  cliente: 'Cliente',
  descartado: 'Descartado',
};

export const PIPELINE_COLORS: Record<string, string> = {
  nuevo: 'bg-gray-100 text-gray-800',
  contactado: 'bg-blue-100 text-blue-800',
  respondio: 'bg-yellow-100 text-yellow-800',
  calificado: 'bg-purple-100 text-purple-800',
  agendado: 'bg-orange-100 text-orange-800',
  cliente: 'bg-green-100 text-green-800',
  descartado: 'bg-red-100 text-red-800',
};

export const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  instagram_oficial: 'Instagram',
  instagram_dm_frio: 'IG DM Frío',
  linkedin: 'LinkedIn',
  sms: 'SMS',
  voz_ai: 'Voz AI',
};

export const TEMP_LABELS: Record<string, string> = {
  cold: 'Frío',
  warm: 'Caliente',
};

// Color consistente por nombre de etiqueta (cada etiqueta siempre el mismo color)
const TAG_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-800',
  'bg-red-100 text-red-700',
  'bg-indigo-100 text-indigo-700',
  'bg-cyan-100 text-cyan-700',
  'bg-lime-100 text-lime-700',
  'bg-rose-100 text-rose-700',
];

export function tagColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
