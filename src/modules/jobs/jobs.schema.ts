import { z } from 'zod'

export const createJobSchema = z.object({
  service_id: z.string().uuid(),
  description: z.string().optional(),
  photo_urls: z.array(z.string().url()).optional(),
  budget: z.number().positive().optional().nullable(),
  urgency: z.enum(['emergency', 'today', 'scheduled']),
  scheduled_at: z.string().datetime().optional().nullable(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string(),
  }),
})

export const updateJobStatusSchema = z.object({
  status: z.enum(['cancelled', 'in_progress', 'completed']),
})

export const partsRequestSchema = z.object({
  description: z.string().min(1),
  cost: z.number().positive(),
})

export const partsApproveSchema = z.object({
  approved: z.boolean(),
})

export const getJobsQuerySchema = z.object({
  status: z.enum(['open', 'offered', 'confirmed', 'in_progress', 'completed', 'cancelled']).optional(),
  category: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radius: z.coerce.number().optional().default(5),
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(20),
})
