import aiConfigJson from './ai.config.json';

export type AiProvider = 'google-ai-studio';

export interface AiConfig {
  provider: AiProvider;
  displayName: string;
  project: string;
  projectNumber: string;
  apiKeyName: string;
  model: string;
  routes: {
    advice: string;
    transcribe: string;
  };
  apiKeyEnv: string[];
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
  topP: number;
}

export const AI_CONFIG = aiConfigJson as AiConfig;
