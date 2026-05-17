import { Router } from 'express'
import { validate } from '../../middleware/validate'
import { authenticate } from '../../middleware/auth'
import { requireRole } from '../../middleware/requireRole'
import { asyncHandler } from '../../utils/asyncHandler'
import * as offersController from './offers.controller'
import * as schema from './offers.schema'

const router = Router()

router.use(authenticate)

// Provider routes
router.post('/', requireRole('provider'), validate(schema.makeOfferSchema), asyncHandler(offersController.makeOffer))
router.patch('/:id/withdraw', requireRole('provider'), asyncHandler(offersController.withdrawOffer))
router.patch('/:id/counter-respond', requireRole('provider'), validate(schema.counterRespondSchema), asyncHandler(offersController.counterRespond))
router.post('/:id/submit-site-quote', requireRole('provider'), validate(schema.siteQuoteSchema), asyncHandler(offersController.submitSiteQuote))

// Customer routes
router.patch('/:id/accept', requireRole('customer'), asyncHandler(offersController.acceptOffer))
router.patch('/:id/decline', requireRole('customer'), asyncHandler(offersController.declineOffer))
router.patch('/:id/counter', requireRole('customer'), validate(schema.counterOfferSchema), asyncHandler(offersController.counterOffer))
router.patch('/:id/confirm-visit', requireRole('customer'), asyncHandler(offersController.confirmVisit))
router.post('/:id/confirm-visit-payment', requireRole('customer'), asyncHandler(offersController.confirmVisitPayment))
router.patch('/:id/accept-site-quote', requireRole('customer'), asyncHandler(offersController.acceptSiteQuote))

export default router
