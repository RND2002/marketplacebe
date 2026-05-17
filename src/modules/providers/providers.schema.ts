import { z } from 'zod'

export const availabilitySchema = z.object({
  is_available: z.boolean(),
  lat: z.number().optional(),
  lng: z.number().optional(),
})

export const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
})

export const updateProfileSchema = z.object({
  bio: z.string().optional(),
  service_areas: z.array(z.string()).optional(),
  upi_id: z.string().optional(),
  years_experience: z.number().optional(),
})

export const uploadDocumentSchema = z.object({
  type: z.string(),
  url: z.string().url(),
})

export const getProvidersQuerySchema = z.object({
  category: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  available: z.enum(['true', 'false']).optional(),
  radius: z.coerce.number().optional().default(50), // larger default for general search
})
