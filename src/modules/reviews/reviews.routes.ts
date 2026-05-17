import { Router } from 'express'
import { validate } from '../../middleware/validate'
import { authenticate } from '../../middleware/auth'
import { requireRole } from '../../middleware/requireRole'
import { asyncHandler } from '../../utils/asyncHandler'
import * as reviewsController from './reviews.controller'
import * as schema from './reviews.schema'

const router = Router()

router.use(authenticate)

router.post('/', requireRole('customer'), validate(schema.createReviewSchema), asyncHandler(reviewsController.createReview))
router.get('/provider/:id', asyncHandler(reviewsController.getProviderReviews))

export default router
