import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { asyncHandler } from '../../utils/asyncHandler'
import * as notificationsController from './notifications.controller'

const router = Router()

router.use(authenticate)

router.get('/', asyncHandler(notificationsController.getNotifications))
router.patch('/read-all', asyncHandler(notificationsController.markAllRead))
router.patch('/:id/read', asyncHandler(notificationsController.markRead))
router.post('/fcm-token', asyncHandler(notificationsController.registerFcmToken))

export default router
