import { Request, Response } from 'express'
import { supabaseAdmin, supabaseAnon } from '../../config/supabase'
import { prisma } from '../../config/prisma'
import { ApiResponse } from '../../utils/apiResponse'
import { ConflictError, UnauthorizedError, AppError } from '../../utils/errors'
import { createClient } from '@supabase/supabase-js'
import { env } from '../../config/env'

export const register = async (req: Request, res: Response) => {
  const { email, password, full_name, phone } = req.body
  // console.log(req.body, "sjsjsj")

  // 1. Check phone not already registered
  const existingPhone = await prisma.profile.findUnique({ where: { phone } })
  if (existingPhone) {
    throw new ConflictError('Phone number already registered')
  }

  // 2. Create user in Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email confirmation
    user_metadata: { full_name, phone, role: 'customer' },
  })

  if (authError || !authData.user) {
    if (authError?.message.includes('already registered')) {
      throw new ConflictError('Email already registered')
    }
    throw new AppError(authError?.message || 'Failed to create user', 500)
  }

  // 3. Insert into profiles table
  const profile = await prisma.profile.create({
    data: {
      id: authData.user.id,
      role: 'customer',
      fullName: full_name,
      phone,
    },
  })

  // 4. Send welcome WhatsApp via Gupshup (TODO in notifications module)

  // 5. Login to get session
  const { data: loginData } = await supabaseAnon.auth.signInWithPassword({
    email,
    password,
  })

  return ApiResponse.success(res, 'Registration successful', {
    user: profile,
    session: loginData.session,
  }, 201)
}

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body

  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password })
  if (error || !data.user || !data.session) {
    throw new UnauthorizedError('Invalid email or password')
  }

  const profile = await prisma.profile.findUnique({
    where: { id: data.user.id },
    include: { providerProfile: true },
  })

  if (!profile) {
    throw new UnauthorizedError('User profile not found')
  }

  if (profile.role === 'provider' && profile.providerProfile) {
    if (profile.providerProfile.status === 'pending_review') {
      throw new AppError('Your account is pending approval. We will notify you on WhatsApp.', 403)
    }
    if (profile.providerProfile.status === 'suspended') {
      throw new AppError('Your account has been suspended.', 403)
    }
  }

  return ApiResponse.success(res, 'Login successful', {
    user: profile,
    session: data.session,
  })
}

export const refresh = async (req: Request, res: Response) => {
  const { refresh_token } = req.body

  const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token })

  if (error || !data.session) {
    throw new UnauthorizedError('Session expired, please login again')
  }

  return ApiResponse.success(res, 'Token refreshed', { session: data.session })
}

export const logout = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization
  if (authHeader) {
    const token = authHeader.split(' ')[1]
    const userSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })
    await userSupabase.auth.signOut()
  }

  return ApiResponse.success(res, 'Logged out successfully')
}

export const getMe = async (req: Request, res: Response) => {
  const userId = req.user!.id

  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    include: { providerProfile: true },
  })

  if (!profile) throw new UnauthorizedError('User not found')

  return ApiResponse.success(res, 'Profile fetched', profile)
}

export const updateMe = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { full_name, avatar_url } = req.body

  const profile = await prisma.profile.update({
    where: { id: userId },
    data: {
      fullName: full_name,
      avatarUrl: avatar_url,
    },
  })

  // Update user metadata in Auth if name changes
  if (full_name) {
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { full_name }
    })
  }

  return ApiResponse.success(res, 'Profile updated', profile)
}

export const changePassword = async (req: Request, res: Response) => {
  const { new_password } = req.body
  const authHeader = req.headers.authorization
  const token = authHeader!.split(' ')[1]

  const userSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { error } = await userSupabase.auth.updateUser({ password: new_password })

  if (error) {
    throw new AppError(error.message, 400)
  }

  return ApiResponse.success(res, 'Password changed successfully')
}

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body

  await supabaseAnon.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.FRONTEND_URL}/reset-password`
  })

  // Always return success
  return ApiResponse.success(res, 'If this email is registered, you will receive a reset link')
}

export const resetPassword = async (req: Request, res: Response) => {
  const { new_password, access_token } = req.body

  const userSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${access_token}` } }
  })

  const { error } = await userSupabase.auth.updateUser({ password: new_password })

  if (error) {
    throw new AppError('Invalid or expired token', 400)
  }

  return ApiResponse.success(res, 'Password reset successful')
}
