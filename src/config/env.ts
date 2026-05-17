import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
  PORT: z.string().default('8000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  DATABASE_URL: z.string(),
  DIRECT_URL: z.string(),

  RAZORPAY_KEY_ID: z.string(),
  RAZORPAY_KEY_SECRET: z.string(),
  RAZORPAY_WEBHOOK_SECRET: z.string(),

  GUPSHUP_API_KEY: z.string(),
  GUPSHUP_APP_NAME: z.string(),
  GUPSHUP_SOURCE_NUMBER: z.string(),

  FIREBASE_PROJECT_ID: z.string(),
  FIREBASE_PRIVATE_KEY: z.string(),
  FIREBASE_CLIENT_EMAIL: z.string().email(),

  PROVIDER_SEARCH_RADIUS_KM: z.coerce.number().default(5),
  MAX_PROVIDERS_NOTIFIED: z.coerce.number().default(5),
  MAX_OFFERS_PER_JOB: z.coerce.number().default(10),
  OFFER_EXPIRY_MINUTES: z.coerce.number().default(60),
  COMMISSION_RATE: z.coerce.number().default(12),

  PROVIDER_EMAIL_DOMAIN: z.string().default('fixkar.app'),
  TEMP_PASSWORD_LENGTH: z.coerce.number().default(10),
})

export const env = envSchema.parse(process.env)
