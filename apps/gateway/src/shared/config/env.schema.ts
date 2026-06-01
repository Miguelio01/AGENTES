import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  DATABASE_URL: z.string().url().optional(),
  MONGODB_URI: z.string().url().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LLM_PROVIDER: z.enum(['OLLAMA', 'GEMINI', 'NVIDIA']).default('OLLAMA'),
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_BASE_URL: z
    .string()
    .url()
    .optional()
    .default('https://integrate.api.nvidia.com/v1'),
  NVIDIA_MODEL: z.string().optional().default('meta/llama-3.3-70b-instruct'),
  NVIDIA_EMBEDDING_MODEL: z
    .string()
    .optional()
    .default('nvidia/nv-embedqa-e5-v5'),
  WHATSAPP_API_TOKEN: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ORDERS_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_ID: z.string().optional(),
  TELEGRAM_PARTNER_KARLOS_ID: z.string().optional(),
  TELEGRAM_PARTNER_PAULA_ID: z.string().optional(),
  TELEGRAM_PARTNER_MANUELA_ID: z.string().optional(),
  USE_OLLAMA: z.string().optional().default('false'),
  OLLAMA_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().optional(),
  GOOGLE_SHEETS_INVENTORY_ID: z.string().optional(),
  GOOGLE_SHEETS_ORDERS_ID: z.string().optional(),
  GOOGLE_WORKSPACE_CLIENT_ID: z.string().optional(),
  GOOGLE_WORKSPACE_CLIENT_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
