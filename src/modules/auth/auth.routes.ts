import { Router } from 'express'
import { validate } from '../../middleware/validate'
import { authenticate } from '../../middleware/auth'
import { asyncHandler } from '../../utils/asyncHandler'
import { authLimiter } from '../../middleware/rateLimiter'
import * as authController from './auth.controller'
import * as schema from './auth.schema'

const router = Router()

// Public auth routes
router.post('/register', authLimiter, validate(schema.registerSchema), asyncHandler(authController.register))
router.post('/login', authLimiter, validate(schema.loginSchema), asyncHandler(authController.login))
router.post('/refresh', validate(schema.refreshSchema), asyncHandler(authController.refresh))
router.post('/forgot-password', authLimiter, validate(schema.forgotPasswordSchema), asyncHandler(authController.forgotPassword))
router.post('/reset-password', validate(schema.resetPasswordSchema), asyncHandler(authController.resetPassword))

// Protected routes
router.use(authenticate)
router.post('/logout', asyncHandler(authController.logout))
router.get('/me', asyncHandler(authController.getMe))
router.patch('/me', validate(schema.updateProfileSchema), asyncHandler(authController.updateMe))
router.post('/change-password', validate(schema.changePasswordSchema), asyncHandler(authController.changePassword))

export default router
