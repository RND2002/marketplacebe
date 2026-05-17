import { z } from 'zod'

export const createOrderSchema = z.object({
  job_id: z.string().uuid(),
  type: z.enum(['visiting_charge', 'job_payment']),
})

export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
  job_id: z.string().uuid(),
})
