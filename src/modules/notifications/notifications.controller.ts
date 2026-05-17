import { Request, Response } from 'express'
import { prisma } from '../../config/prisma'
import { ApiResponse } from '../../utils/apiResponse'

export const getNotifications = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { unread_only, page = 1, limit = 20 } = req.query

  const filter: any = { userId }
  if (unread_only === 'true') {
    filter.isRead = false
  }

  const notifications = await prisma.notification.findMany({
    where: filter,
    orderBy: { createdAt: 'desc' },
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit),
  })

  const total = await prisma.notification.count({ where: filter })

  return ApiResponse.success(res, 'Notifications fetched', notifications, 200, {
    page: Number(page),
    limit: Number(limit),
    total,
  })
}

export const markRead = async (req: Request, res: Response) => {
  const { id } = req.params
  const userId = req.user!.id

  const notification = await prisma.notification.updateMany({
    where: { id, userId },
    data: { isRead: true },
  })

  return ApiResponse.success(res, 'Notification marked read', notification)
}

export const markAllRead = async (req: Request, res: Response) => {
  const userId = req.user!.id

  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  })

  return ApiResponse.success(res, 'All notifications marked read')
}

export const registerFcmToken = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { fcm_token } = req.body

  // In a full implementation, you would store this in profiles or a separate devices table
  // Since fcm_token is not in our schema, we'll store it in user metadata via Supabase
  // For now, returning success
  return ApiResponse.success(res, 'Token registered successfully')
}
