import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url().optional(),
  MONGODB_URI: z.string().url().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  WHATSAPP_API_TOKEN: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_ID: z.string().optional(),
  USE_OLLAMA: z.string().optional().default('false'),
  OLLAMA_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().optional(),
  GOOGLE_WORKSPACE_CLIENT_ID: z.string().optional(),
  GOOGLE_WORKSPACE_CLIENT_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
