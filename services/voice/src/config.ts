const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 3001),
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
  isProd: process.env.NODE_ENV === 'production',

  cognito: {
    userPoolId: required('COGNITO_USER_POOL_ID'),
    clientId: required('COGNITO_CLIENT_ID'),
  },

  // Server-side only. A browser WebSocket cannot set the `api-subscription-key`
  // header Sarvam's realtime endpoint requires, so proxying through this service
  // is structurally forced, not merely preferred.
  sarvam: {
    apiKey: required('SARVAM_API_KEY'),
    baseUrl: process.env.SARVAM_BASE_URL ?? 'https://api.sarvam.ai',
    realtimeUrl:
      process.env.SARVAM_REALTIME_URL ?? 'wss://api.sarvam.ai/speech-to-text-realtime/ws',
    ttsStreamUrl: process.env.SARVAM_TTS_WS_URL ?? 'wss://api.sarvam.ai/text-to-speech/ws',
    timeoutMs: Number(process.env.SARVAM_TIMEOUT_MS ?? 30000),
    // How long to wait after release for the final transcript before settling for
    // the last partial. A stalled socket must not hold the whole turn hostage.
    finalTimeoutMs: Number(process.env.SARVAM_FINAL_TIMEOUT_MS ?? 4000),
    sttModel: 'saaras:v3-realtime',
    ttsModel: 'bulbul:v3',
    translateModel: 'mayura:v1',
    defaultSpeaker: process.env.SARVAM_TTS_SPEAKER ?? 'priya',
  },

  bedrock: {
    // Inference profile id, not a bare model id — bare ids fail in ap-northeast-1
    // with "on-demand throughput isn't supported". `jp.` keeps inference in-region,
    // which matters because this is the one synchronous agent.
    modelId: process.env.VOICE_MODEL_ID ?? 'jp.anthropic.claude-haiku-4-5-20251001-v1:0',
  },

  tableName: required('APP_TABLE_NAME'),

  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
} as const;
