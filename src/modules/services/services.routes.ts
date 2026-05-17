import { Router } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import { authenticate } from '../../middleware/auth'
import { requireRole } from '../../middleware/requireRole'
import * as servicesController from './services.controller'

const router = Router()

// Public
router.get('/', asyncHandler(servicesController.getServices))
router.get('/:id', asyncHandler(servicesController.getService))

// Admin only
router.use(authenticate)
router.use(requireRole('admin'))
router.post('/', asyncHandler(servicesController.createService))
router.patch('/:id', asyncHandler(servicesController.updateService))

export default router
