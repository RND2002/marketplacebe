import { Router } from 'express'
import { validate } from '../../middleware/validate'
import { authenticate } from '../../middleware/auth'
import { requireRole } from '../../middleware/requireRole'
import { asyncHandler } from '../../utils/asyncHandler'
import * as providersController from './providers.controller'
import * as schema from './providers.schema'

const router = Router()

router.use(authenticate)

router.get('/', validate(schema.getProvidersQuerySchema), asyncHandler(providersController.getProviders))
router.get('/me', requireRole('provider'), asyncHandler(providersController.getProviderMe))
router.get('/:id', asyncHandler(providersController.getProvider))

// Provider only self-management routes
router.patch('/me/availability', requireRole('provider'), validate(schema.availabilitySchema), asyncHandler(providersController.toggleAvailability))
router.patch('/me/location', requireRole('provider'), validate(schema.locationSchema), asyncHandler(providersController.updateLocation))
router.patch('/me/profile', requireRole('provider'), validate(schema.updateProfileSchema), asyncHandler(providersController.updateProfile))
router.post('/me/submit-review', requireRole('provider'), asyncHandler(providersController.submitReview))
router.post('/me/documents', requireRole('provider'), validate(schema.uploadDocumentSchema), asyncHandler(providersController.uploadDocument))
router.get('/me/earnings', requireRole('provider'), asyncHandler(providersController.getEarnings))
router.get('/me/jobs', requireRole('provider'), asyncHandler(providersController.getJobs))

export default router
