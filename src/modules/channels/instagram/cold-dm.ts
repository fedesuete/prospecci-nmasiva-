// ============================================
// Instagram DM Frío Masivo — Módulo separado y OPCIONAL
// ALTO RIESGO de baneo. Límite estricto 30-50 DMs/día por cuenta
// NO usar API oficial. Requiere automatización de terceros.
// ============================================

// Este módulo es un placeholder estructural.
// La implementación real requiere integración con herramientas de automatización
// de terceros (Jarvee, IGDMPro, etc.) que manejan sesiones de Instagram.

const DAILY_LIMIT_PER_ACCOUNT = 40;

interface ColdDMConfig {
  accountId: string;
  dailyLimit: number;
  sentToday: number;
  warmupActions: boolean; // Ver story/like antes del DM
}

interface ColdDMOptions {
  leadId: string;
  targetHandle: string;
  message: string;
  accountConfig: ColdDMConfig;
}

export async function sendColdDM(_options: ColdDMOptions): Promise<{
  success: boolean;
  error?: string;
}> {
  // Placeholder — la lógica real depende de la herramienta de automatización elegida

  if (_options.accountConfig.sentToday >= Math.min(_options.accountConfig.dailyLimit, DAILY_LIMIT_PER_ACCOUNT)) {
    return { success: false, error: 'Límite diario alcanzado para esta cuenta de IG' };
  }

  // TODO: Implementar cuando se elija herramienta de automatización
  // Flujo esperado:
  // 1. Warmup: ver story o dar like a un post del target (si warmupActions = true)
  // 2. Delay aleatorio largo (2-5 minutos)
  // 3. Enviar DM con variación de mensaje
  // 4. Registrar en messages con channel_id = 'instagram_dm_frio'

  return { success: false, error: 'Módulo de DM frío no implementado — requiere herramienta de automatización' };
}
