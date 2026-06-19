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

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
