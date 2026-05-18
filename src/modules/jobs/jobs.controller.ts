import { Request, Response } from 'express'
import { prisma } from '../../config/prisma'
import { supabaseAdmin } from '../../config/supabase'
import { ApiResponse } from '../../utils/apiResponse'
import { AppError, NotFoundError, ForbiddenError } from '../../utils/errors'
import { notifyNearbyProviders } from '../../jobs/notifyProviders'
import { whatsappService } from '../notifications/whatsapp.service'
import { pushService } from '../notifications/push.service'

export const createJob = async (req: Request, res: Response) => {
  const { service_id, description, photo_urls, budget, urgency, scheduled_at, location } = req.body
  const customerId = req.user!.id

  const service = await prisma.service.findUnique({ where: { id: service_id } })
  if (!service) throw new NotFoundError('Service not found')

  if (service.jobType === 'fixed' && (!budget || Number(budget) < Number(service.minPrice))) {
    throw new AppError(`Budget must be at least ₹${service.minPrice}`, 400)
  }

  // Insert job
  const job = await prisma.$transaction(async (tx) => {
    // We use a raw query here because Prisma doesn't natively support PostGIS Point insertions via standard creates without Unsupported type casting tricks.
    const newJobResult = await tx.$queryRaw<any[]>`
      INSERT INTO jobs (
        customer_id, service_id, category, job_type, description, photo_urls,
        budget, urgency, scheduled_at, location, address, visiting_charge, status
      ) VALUES (
        ${customerId}::uuid, ${service.id}::uuid, ${service.category}::service_category, ${service.jobType}::job_type,
        ${description || null}, ${photo_urls || '{}'}, ${budget || null}, ${urgency}::urgency_type,
        ${scheduled_at ? new Date(scheduled_at) : null}, ST_MakePoint(${location.lng}, ${location.lat})::geography,
        ${location.address}, ${service.visitingCharge || null}, 'open'
      ) RETURNING id, category, address, budget
    `
    return newJobResult[0]
  })

  // Create Razorpay order if needed (omitted here, handled in Payments module per prompt or you can do it here if preferred. Prompt says "return { job, razorpay_order }")
  // For now, returning job, razorpay_order will be null until integrated with razorpay.

  // Trigger background job
  notifyNearbyProviders({
    ...job,
    location,
    service_name: service.name,
  }).catch(err => console.error('Failed to notify providers:', err))

  return ApiResponse.success(res, 'Job created successfully', { job, razorpay_order: null }, 201)
}

export const getJobs = async (req: Request, res: Response) => {
  const { status, category, page = 1, limit = 20 } = req.query as any
  const user = req.user!
  const offset = (Number(page) - 1) * Number(limit)

  let filter: any = {}
  if (user.role === 'customer') {
    filter.customerId = user.id
  } else if (user.role === 'provider') {
    filter.offers = {
      some: {
        providerId: user.id
      }
    }
  }

  if (status) filter.status = status
  if (category) filter.category = category

  const jobs = await prisma.job.findMany({
    where: filter,
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: Number(limit),
    include: {
      service: true,
      offers: {
        include: {
          provider: true
        }
      }
    }
  })

  // Extract real PostGIS coordinates for the user's jobs
  const jobIds = jobs.map(j => j.id)
  let coordinatesMap = new Map<string, { lat: number, lng: number }>()

  if (jobIds.length > 0) {
    const raws = await prisma.$queryRaw<any[]>`
      SELECT id::text, ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
      FROM jobs
      WHERE id::text = ANY(${jobIds})
    `
    for (const raw of raws) {
      coordinatesMap.set(raw.id, { lat: Number(raw.lat) || 0, lng: Number(raw.lng) || 0 })
    }
  }

  const formattedJobs = jobs.map(job => {
    const coords = coordinatesMap.get(job.id) || { lat: 0, lng: 0 }
    return {
      ...job,
      service_name: job.service.name,
      location: {
        lat: coords.lat,
        lng: coords.lng,
        address: job.address
      }
    }
  })

  return ApiResponse.success(res, 'Jobs fetched', formattedJobs)
}

export const getNearbyJobs = async (req: Request, res: Response) => {
  const { category, lat, lng, radius = 5, page = 1, limit = 20 } = req.query as any
  const user = req.user!
  const offset = (Number(page) - 1) * Number(limit)

  if (!lat || !lng) throw new AppError('Provider location required', 400)

  // Fetch jobs near provider using PostGIS
  const jobs = await prisma.$queryRaw<any[]>`
    SELECT 
      j.id, 
      j.customer_id, 
      j.service_id, 
      j.category, 
      j.job_type, 
      j.description, 
      j.photo_urls, 
      j.budget, 
      j.urgency, 
      j.scheduled_at, 
      j.address, 
      j.visiting_charge, 
      j.visiting_charge_paid, 
      j.agreed_price, 
      j.final_price, 
      j.status, 
      j.accepted_offer_id, 
      j.parts_requested, 
      j.parts_cost, 
      j.parts_approved, 
      j.created_at, 
      j.confirmed_at, 
      j.completed_at,
      s.name as service_name,
      s.min_price as service_min_price,
      ST_X(j.location::geometry) as lng,
      ST_Y(j.location::geometry) as lat,
      ST_Distance(j.location, ST_SetSRID(ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)}), 4326)::geography) / 1000 as distance_km
    FROM jobs j
    JOIN services s ON s.id = j.service_id
    JOIN provider_profiles pp ON pp.user_id = ${user.id}::uuid
    WHERE j.status::text IN ('open', 'offered')
      AND j.category::text = ANY(pp.categories::text[])
      AND ST_DWithin(
        j.location,
        ST_SetSRID(ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)}), 4326)::geography,
        ${parseFloat(radius)} * 1000
      )
    ORDER BY 
      CASE j.urgency::text WHEN 'emergency' THEN 1 WHEN 'today' THEN 2 ELSE 3 END ASC,
      distance_km ASC
    LIMIT ${Number(limit)} OFFSET ${offset}
  `

  const formattedJobs = jobs.map(job => ({
    ...job,
    service_name: job.service_name,
    service_min_price: Number(job.service_min_price) || 100,
    location: {
      lat: Number(job.lat),
      lng: Number(job.lng),
      address: job.address
    }
  }))

  // Attach provider's offers to these jobs so frontend can render quick actions (like Accept/Decline counter)
  const jobIds = formattedJobs.map(j => j.id)
  const providerOffers = await prisma.offer.findMany({
    where: { jobId: { in: jobIds }, providerId: user.id }
  })

  const jobsWithOffers = formattedJobs.map(j => ({
    ...j,
    offers: providerOffers.filter(o => o.jobId === j.id)
  }))

  return ApiResponse.success(res, 'Nearby jobs fetched', jobsWithOffers)
}

export const getJob = async (req: Request, res: Response) => {
  const { id } = req.params
  const user = req.user!

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      service: true,
      customer: { select: { id: true, fullName: true, avatarUrl: true, phone: true } },
      offers: { include: { provider: true } },
    }
  })

  if (!job) throw new NotFoundError('Job not found')

  // Authorization check
  if (user.role === 'customer' && job.customerId !== user.id) {
    throw new ForbiddenError('Access denied')
  }
  if (user.role === 'provider') {
    const hasOffer = job.offers.some(o => o.providerId === user.id)
    if (!hasOffer && job.status !== 'open') throw new ForbiddenError('Access denied')
  }

  // Hide phone unless confirmed provider/customer
  if (user.role === 'customer') {
    job.offers = job.offers.map(o => ({
      ...o,
      provider: o.status === 'accepted' ? o.provider : { ...o.provider, phone: null }
    })) as any
  }
  if (user.role === 'provider' && job.status !== 'confirmed' && job.status !== 'in_progress') {
    (job.customer as any).phone = null
  }

  // Extract real PostGIS coordinates for this job
  const [jobRaw] = await prisma.$queryRaw<any[]>`
    SELECT ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
    FROM jobs
    WHERE id = ${job.id}::uuid
  `

  const formattedJob = {
    ...job,
    service_name: job.service.name,
    location: {
      lat: jobRaw ? Number(jobRaw.lat) || 0 : 0,
      lng: jobRaw ? Number(jobRaw.lng) || 0 : 0,
      address: job.address
    }
  }

  return ApiResponse.success(res, 'Job fetched', formattedJob)
}

export const updateJobStatus = async (req: Request, res: Response) => {
  const { id } = req.params
  const { status } = req.body
  const user = req.user!

  const job = await prisma.job.findUnique({ where: { id } })
  if (!job) throw new NotFoundError('Job not found')

  let updateData: any = { status, updatedAt: new Date() }

  if (user.role === 'customer') {
    if (status !== 'cancelled') throw new ForbiddenError('Customers can only cancel jobs')
    if (job.customerId !== user.id) throw new ForbiddenError('Access denied')
    if (['in_progress', 'completed', 'cancelled'].includes(job.status!)) {
      throw new AppError('Cannot cancel job at this stage', 400)
    }
    updateData.cancelledAt = new Date()
    updateData.cancelledById = user.id
  } else if (user.role === 'provider') {
    if (!['in_progress', 'completed'].includes(status)) {
      throw new ForbiddenError('Providers can only mark in_progress or completed')
    }
    // Check if this provider is the accepted one
    const acceptedOffer = await prisma.offer.findUnique({ where: { id: job.acceptedOfferId! } })
    if (!acceptedOffer || acceptedOffer.providerId !== user.id) {
      throw new ForbiddenError('Access denied')
    }
    if (status === 'in_progress') updateData.startedAt = new Date()
    if (status === 'completed') {
      updateData.completedAt = new Date()
      // Final price calculation could be added here including parts
      updateData.finalPrice = job.agreedPrice
    }
  }

  const updatedJob = await prisma.job.update({
    where: { id },
    data: updateData,
    include: { customer: true }
  })

  if (status === 'completed') {
    await whatsappService.sendJobCompleted(updatedJob.customer.phone || '', updatedJob)
  }

  return ApiResponse.success(res, 'Job status updated', updatedJob)
}

export const getJobOffers = async (req: Request, res: Response) => {
  const { id } = req.params
  const user = req.user!

  const job = await prisma.job.findUnique({ where: { id } })
  if (!job) throw new NotFoundError('Job not found')

  if (user.role === 'customer' && job.customerId !== user.id) {
    throw new ForbiddenError('Access denied')
  }

  const offers = await prisma.offer.findMany({
    where: { jobId: id },
    include: {
      provider: { select: { id: true, fullName: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' }
  })

  return ApiResponse.success(res, 'Offers fetched', offers)
}

export const requestParts = async (req: Request, res: Response) => {
  const { id } = req.params
  const { description, cost } = req.body
  const user = req.user!

  const job = await prisma.job.findUnique({ where: { id }, include: { customer: true } })
  if (!job) throw new NotFoundError('Job not found')

  const acceptedOffer = await prisma.offer.findUnique({ where: { id: job.acceptedOfferId! } })
  if (!acceptedOffer || acceptedOffer.providerId !== user.id) {
    throw new ForbiddenError('Access denied')
  }

  const updatedJob = await prisma.job.update({
    where: { id },
    data: {
      partsRequested: true,
      partsDescription: description,
      partsCost: cost,
      partsApproved: false,
    }
  })

  await whatsappService.sendPartsRequest(job.customer.phone || '', description, cost)

  // Need FCM token for push (we mocked this)

  return ApiResponse.success(res, 'Parts request sent', updatedJob)
}

export const approveParts = async (req: Request, res: Response) => {
  const { id } = req.params
  const { approved } = req.body
  const user = req.user!

  const job = await prisma.job.findUnique({ where: { id } })
  if (!job || job.customerId !== user.id) throw new NotFoundError('Job not found or access denied')

  const updatedJob = await prisma.job.update({
    where: { id },
    data: { partsApproved: approved }
  })

  return ApiResponse.success(res, 'Parts request responded', updatedJob)
}
