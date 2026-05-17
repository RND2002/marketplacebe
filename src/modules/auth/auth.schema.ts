import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(2, 'Full name required'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Valid 10 digit Indian mobile number required'),
})

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password is required'),
})

export const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email required'),
})

export const resetPasswordSchema = z.object({
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
  access_token: z.string().min(1, 'Access token is required'),
})

export const updateProfileSchema = z.object({
  full_name: z.string().min(2).optional(),
  avatar_url: z.string().url().optional(),
})

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(8, 'New password must be at least 8 characters'),
})
