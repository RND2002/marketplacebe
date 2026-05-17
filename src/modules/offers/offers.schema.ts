import { z } from 'zod'

export const makeOfferSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('offer'),
    job_id: z.string().uuid(),
    price: z.number().positive('Price must be positive'),
    note: z.string().max(150).optional(),
  }),
  z.object({
    type: z.literal('visit_request'),
    job_id: z.string().uuid(),
    visit_note: z.string().max(150).optional(),
  }),
])

export const counterOfferSchema = z.object({
  counter_price: z.number().positive('Counter price must be positive'),
  counter_note: z.string().max(100).optional(),
})

export const counterRespondSchema = z.object({
  accepted: z.boolean(),
})

export const siteQuoteSchema = z.object({
  site_quote: z.number().positive(),
  site_quote_note: z.string().max(200).optional(),
})
