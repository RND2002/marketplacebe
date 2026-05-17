import { Router } from 'express'
import { validate } from '../../middleware/validate'
import { authenticate, optionalAuth } from '../../middleware/auth'
import { requireRole } from '../../middleware/requireRole'
import { asyncHandler } from '../../utils/asyncHandler'
import * as paymentsController from './payments.controller'
import * as schema from './payments.schema'

const router = Router()

// Webhook doesn't use standard auth
router.post('/webhook', asyncHandler(paymentsController.webhook))

router.use(authenticate)

router.post('/create-order', requireRole('customer'), validate(schema.createOrderSchema), asyncHandler(paymentsController.createOrder))
router.post('/verify', requireRole('customer'), validate(schema.verifyPaymentSchema), asyncHandler(paymentsController.verifyPayment))
router.get('/job/:jobId', asyncHandler(paymentsController.getJobPayment))

export default router
