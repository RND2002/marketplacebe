import { Router } from 'express'
import { validate } from '../../middleware/validate'
import { authenticate } from '../../middleware/auth'
import { requireRole } from '../../middleware/requireRole'
import { asyncHandler } from '../../utils/asyncHandler'
import * as adminController from './admin.controller'
import * as schema from './admin.schema'

const router = Router()

router.use(authenticate)
router.use(requireRole('admin'))

router.get('/dashboard', asyncHandler(adminController.getDashboard))

// Provider management
router.get('/providers', asyncHandler(adminController.getProviders))
router.post('/providers/create', validate(schema.createProviderSchema), asyncHandler(adminController.createProvider))
router.patch('/providers/:id/approve', asyncHandler(adminController.approveProvider))
router.patch('/providers/:id/suspend', validate(schema.suspendProviderSchema), asyncHandler(adminController.suspendProvider))

// Global resources
router.get('/jobs', asyncHandler(adminController.getJobs))
router.get('/payments', asyncHandler(adminController.getPayments))

export default router
