import { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../config/supabase'
import { prisma } from '../config/prisma'
import { UnauthorizedError } from '../utils/errors'
import { UserRole } from '../types/user.types'

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided')
    }

    const token = authHeader.split(' ')[1]

    // Verify token with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

    if (error || !user) {
      throw new UnauthorizedError('Invalid or expired token')
    }

    // Fetch role from profiles table via Prisma
    let profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { id: true, role: true, phone: true },
    })

    if (!profile) {
      // Self-healing: If Supabase auth user exists but PostgreSQL profile doesn't, create it!
      profile = await prisma.profile.create({
        data: {
          id: user.id,
          role: (user.user_metadata?.role as any) || 'customer',
          fullName: user.user_metadata?.full_name || ' ',
          phone: user.user_metadata?.phone || `temp_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        },
        select: { id: true, role: true, phone: true },
      })
    }

    // Attach to request
    req.user = {
      id: profile.id,
      role: profile.role as UserRole,
      email: user.email ?? '',
      phone: profile.phone,
    }

    next()
  } catch (error) {
    next(error)
  }
}

// Optional auth — doesn't fail if no token, just doesn't attach user
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return next() // continue without user
    }
    await authenticate(req, res, next)
  } catch {
    next() // continue without user
  }
}
