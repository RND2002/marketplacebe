import { Request, Response } from 'express'
import { prisma } from '../../config/prisma'
import { ApiResponse } from '../../utils/apiResponse'
import { AppError, NotFoundError, ForbiddenError, ConflictError } from '../../utils/errors'
import { whatsappService } from '../notifications/whatsapp.service'

export const createReview = async (req: Request, res: Response) => {
  const customerId = req.user!.id
  const { job_id, rating, comment, tags } = req.body

  const job = await prisma.job.findUnique({
    where: { id: job_id },
    include: { offers: true }
  })

  if (!job) throw new NotFoundError('Job not found')
  if (job.customerId !== customerId) throw new ForbiddenError('Access denied')
  if (job.status !== 'completed') throw new AppError('Can only review completed jobs', 400)

  const acceptedOffer = job.offers.find(o => o.status === 'accepted')
  if (!acceptedOffer) throw new AppError('Job has no accepted provider', 400)

  const providerId = acceptedOffer.providerId

  const existingReview = await prisma.review.findUnique({ where: { jobId: job_id } })
  if (existingReview) throw new ConflictError('Review already exists for this job')

  const review = await prisma.$transaction(async (tx) => {
    const newReview = await tx.review.create({
      data: {
        jobId: job_id,
        customerId,
        providerId,
        rating,
        comment,
        tags: tags || []
      }
    })

    // The rating is auto-updated by DB trigger based on schema. 
    // We don't need to manually update provider_profiles here.

    return newReview
  })

  // Thank customer
  // Not passing customer phone easily here, we could fetch it.
  const customer = await prisma.profile.findUnique({ where: { id: customerId } })
  if (customer && customer.phone) {
    await whatsappService.sendWhatsApp(customer.phone, 'Aapke review ke liye dhanyawad! Is-se provider ki rating improve hogi.')
  }

  return ApiResponse.success(res, 'Review submitted successfully', review, 201)
}

export const getProviderReviews = async (req: Request, res: Response) => {
  const { id } = req.params // providerId
  const { page = 1, limit = 10 } = req.query

  const reviews = await prisma.review.findMany({
    where: { providerId: id },
    include: { customer: { select: { fullName: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit)
  })

  const total = await prisma.review.count({ where: { providerId: id } })

  return ApiResponse.success(res, 'Reviews fetched', reviews, 200, {
    page: Number(page),
    limit: Number(limit),
    total
  })
}
