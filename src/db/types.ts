// Tipos que mapean directamente a los enums y tablas de la DB

export type LeadTemperature = 'cold' | 'warm';

export type PipelineStatus =
  | 'nuevo'
  | 'contactado'
  | 'respondio'
  | 'calificado'
  | 'agendado'
  | 'cliente'
  | 'descartado';

export type LeadSourceType = 'csv' | 'facebook_lead_ads' | 'scraping' | 'manual' | 'webhook';

export type WhatsAppLineStatus = 'active' | 'warming_up' | 'paused' | 'banned';

export type SequenceEnrollmentStatus = 'active' | 'paused' | 'completed' | 'cancelled' | 'replied';

export type MessageDirection = 'outbound' | 'inbound';

export type MessageContentType = 'text' | 'audio' | 'image' | 'template';

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';

export type StepCondition = 'always' | 'if_no_reply' | 'if_replied';

export type ChannelId =
  | 'whatsapp'
  | 'email'
  | 'instagram_oficial'
  | 'instagram_dm_frio'
  | 'linkedin'
  | 'sms'
  | 'voz_ai'
  | 'fb_messenger'
  | 'google_business';

// Row types

export interface LeadSource {
  id: string;
  type: LeadSourceType;
  name: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Lead {
  id: string;
  source_id: string | null;
  first_name: string;
  last_name: string | null;
  company_name: string | null;
  phone: string;
  email: string | null;
  instagram_handle: string | null;
  linkedin_url: string | null;
  niche: string | null;
  city: string | null;
  rubro: string | null;
  temperature: LeadTemperature;
  pipeline_status: PipelineStatus;
  pipeline_status_changed_at: string;
  do_not_contact: boolean;
  tags: string[];
  raw_data: Record<string, unknown>;
  assigned_line_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: ChannelId;
  display_name: string;
  is_active: boolean;
  config: Record<string, unknown>;
  created_at: string;
}

export interface WhatsAppLine {
  id: string;
  instance_name: string;
  phone_number: string;
  display_name: string;
  status: WhatsAppLineStatus;
  daily_limit: number;
  sent_today: number;
  last_reset_at: string;
  warmup_start_date: string | null;
  warmup_daily_increment: number;
  api_url: string;
  api_key: string;
  created_at: string;
  updated_at: string;
}

export interface AudioVariant {
  id: string;
  name: string;
  file_path: string;
  duration_seconds: number | null;
  niche: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Sequence {
  id: string;
  name: string;
  target_niche: string | null;
  target_city: string | null;
  target_temperature: LeadTemperature | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_order: number;
  channel_id: ChannelId;
  message_template: string;
  use_audio: boolean;
  delay_hours: number;
  condition: StepCondition;
  created_at: string;
}

export interface SequenceEnrollment {
  id: string;
  lead_id: string;
  sequence_id: string;
  current_step_order: number;
  status: SequenceEnrollmentStatus;
  enrolled_at: string;
  next_step_at: string | null;
  completed_at: string | null;
}

export interface Message {
  id: string;
  lead_id: string;
  channel_id: ChannelId;
  whatsapp_line_id: string | null;
  enrollment_id: string | null;
  direction: MessageDirection;
  content_type: MessageContentType;
  content: string | null;
  audio_variant_id: string | null;
  audio_hash: string;
  external_id: string | null;
  status: MessageStatus;
  error_detail: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface PipelineHistoryEntry {
  id: string;
  lead_id: string;
  from_status: string;
  to_status: string;
  changed_by: string;
  channel_id: ChannelId | null;
  whatsapp_line_id: string | null;
  notes: string | null;
  created_at: string;
}

// Insert types (sin campos auto-generados)

export interface LeadInsert {
  source_id?: string;
  first_name: string;
  last_name?: string;
  company_name?: string;
  phone: string;
  email?: string;
  instagram_handle?: string;
  linkedin_url?: string;
  niche?: string;
  city?: string;
  rubro?: string;
  temperature?: LeadTemperature;
  pipeline_status?: PipelineStatus;
  do_not_contact?: boolean;
  tags?: string[];
  raw_data?: Record<string, unknown>;
  assigned_line_id?: string;
}

export interface MessageInsert {
  lead_id: string;
  channel_id: ChannelId;
  whatsapp_line_id?: string;
  enrollment_id?: string;
  direction: MessageDirection;
  content_type?: MessageContentType;
  content?: string;
  audio_variant_id?: string;
  audio_hash?: string;
  external_id?: string;
  status?: MessageStatus;
  error_detail?: string;
  sent_at?: string;
}
