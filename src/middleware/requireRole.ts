import { Request, Response, NextFunction } from 'express'
import { ForbiddenError } from '../utils/errors'
import type { UserRole } from '../types/user.types'

export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenError('Authentication required'))
    }
    if (!roles.includes(req.user.role)) {
      return next(
        new ForbiddenError(`Access denied. Required role: ${roles.join(' or ')}`)
      )
    }
    next()
  }
}
