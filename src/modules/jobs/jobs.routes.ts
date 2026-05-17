import { Router } from 'express'
import { validate } from '../../middleware/validate'
import { authenticate } from '../../middleware/auth'
import { requireRole } from '../../middleware/requireRole'
import { asyncHandler } from '../../utils/asyncHandler'
import * as jobsController from './jobs.controller'
import * as schema from './jobs.schema'

const router = Router()

router.use(authenticate)

router.get('/', validate(schema.getJobsQuerySchema), asyncHandler(jobsController.getJobs))
router.get('/nearby', validate(schema.getJobsQuerySchema), asyncHandler(jobsController.getNearbyJobs))
router.get('/:id', asyncHandler(jobsController.getJob))
router.get('/:id/offers', asyncHandler(jobsController.getJobOffers))
router.patch('/:id', validate(schema.updateJobStatusSchema), asyncHandler(jobsController.updateJobStatus))

// Customer only
router.post('/', requireRole('customer'), validate(schema.createJobSchema), asyncHandler(jobsController.createJob))
router.post('/:id/parts-approve', requireRole('customer'), validate(schema.partsApproveSchema), asyncHandler(jobsController.approveParts))

// Provider only
router.post('/:id/parts-request', requireRole('provider'), validate(schema.partsRequestSchema), asyncHandler(jobsController.requestParts))

export default router
