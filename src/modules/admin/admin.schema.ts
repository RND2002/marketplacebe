import { z } from 'zod'

export const createProviderSchema = z.object({
  full_name: z.string().min(2),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  categories: z.array(z.enum(['electrician', 'plumber', 'ac_repair'])).min(1),
  years_experience: z.number().optional(),
  service_areas: z.array(z.string()).optional(),
})

export const suspendProviderSchema = z.object({
  reason: z.string().min(5),
})
