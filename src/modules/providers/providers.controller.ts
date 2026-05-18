import { Request, Response } from 'express'
import { prisma } from '../../config/prisma'
import { ApiResponse } from '../../utils/apiResponse'
import { NotFoundError, AppError } from '../../utils/errors'

export const getProviders = async (req: Request, res: Response) => {
  const { category, lat, lng, available, radius = 50 } = req.query as any

  if (lat && lng) {
    let query = `
      SELECT p.id, p.full_name, p.avatar_url,
             pp.status, pp.is_available, pp.rating_avg, pp.total_jobs, pp.categories,
             ST_Distance(pp.location, ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)})::geography) / 1000 as distance_km
      FROM profiles p
      JOIN provider_profiles pp ON p.id = pp.user_id
      WHERE pp.status = 'active'
    `
    if (available === 'true') query += ` AND pp.is_available = true`
    if (category) query += ` AND '${category}' = ANY(pp.categories)`
    query += ` AND ST_DWithin(pp.location, ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)})::geography, ${parseFloat(radius)} * 1000)`
    query += ` ORDER BY distance_km ASC`

    const providers = await prisma.$queryRawUnsafe(query)
    return ApiResponse.success(res, 'Providers fetched', providers)
  }

  // Fallback non-spatial search
  const filter: any = { status: 'active' }
  if (available === 'true') filter.isAvailable = true
  if (category) filter.categories = { has: category }

  const providers = await prisma.providerProfile.findMany({
    where: filter,
    include: { profile: { select: { id: true, fullName: true, avatarUrl: true } } },
    orderBy: { ratingAvg: 'desc' }
  })

  return ApiResponse.success(res, 'Providers fetched', providers)
}

export const getProviderMe = async (req: Request, res: Response) => {
  const userId = req.user!.id

  let providerProfile = await prisma.providerProfile.findUnique({
    where: { userId },
    include: {
      profile: { select: { id: true, fullName: true, avatarUrl: true } }
    }
  })

  if (!providerProfile) {
    // Self-healing: if the user's role is provider but no providerProfile exists, create it!
    const profile = await prisma.profile.findUnique({ where: { id: userId } })
    if (profile && profile.role === 'provider') {
      providerProfile = await prisma.providerProfile.create({
        data: {
          userId,
          status: 'active',
          categories: [],
          serviceAreas: [],
          isAvailable: true,
        },
        include: {
          profile: { select: { id: true, fullName: true, avatarUrl: true } }
        }
      })
    } else {
      throw new NotFoundError('Provider profile not found')
    }
  }

  const reviews = await prisma.review.findMany({
    where: { providerId: userId },
    include: { customer: { select: { fullName: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10
  })

  return ApiResponse.success(res, 'Provider fetched', {
    ...providerProfile,
    profile: undefined, // flatten somewhat
    id: providerProfile.profile.id,
    fullName: providerProfile.profile.fullName,
    avatarUrl: providerProfile.profile.avatarUrl,
    reviews
  })
}

export const getProvider = async (req: Request, res: Response) => {
  const { id } = req.params
  const targetId = id === 'me' ? req.user!.id : id

  const providerProfile = await prisma.providerProfile.findUnique({
    where: { userId: targetId },
    include: {
      profile: { select: { id: true, fullName: true, avatarUrl: true } }
    }
  })

  if (!providerProfile) throw new NotFoundError('Provider not found')

  const reviews = await prisma.review.findMany({
    where: { providerId: targetId },
    include: { customer: { select: { fullName: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10
  })

  return ApiResponse.success(res, 'Provider fetched', {
    ...providerProfile,
    profile: undefined, // flatten somewhat
    id: providerProfile.profile.id,
    fullName: providerProfile.profile.fullName,
    avatarUrl: providerProfile.profile.avatarUrl,
    reviews
  })
}

export const toggleAvailability = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { is_available, lat, lng } = req.body

  if (lat && lng) {
    await prisma.$queryRaw`
      UPDATE provider_profiles
      SET is_available = ${is_available},
          location = ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)})::geography,
          location_updated_at = NOW()
      WHERE user_id = ${userId}::uuid
    `
  } else {
    await prisma.providerProfile.update({
      where: { userId },
      data: { isAvailable: is_available }
    })
  }

  const updated = await prisma.providerProfile.findUnique({ where: { userId } })
  return ApiResponse.success(res, 'Availability updated', updated)
}

export const updateLocation = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { lat, lng } = req.body

  await prisma.$queryRaw`
    UPDATE provider_profiles
    SET location = ST_MakePoint(${parseFloat(lng)}, ${parseFloat(lat)})::geography,
        location_updated_at = NOW()
    WHERE user_id = ${userId}::uuid
  `
  return ApiResponse.success(res, 'Location updated')
}

export const updateProfile = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { bio, service_areas, upi_id, years_experience, categories, aadhaar_number } = req.body

  const updated = await prisma.providerProfile.update({
    where: { userId },
    data: { 
      bio, 
      serviceAreas: service_areas, 
      upiId: upi_id, 
      yearsExperience: years_experience,
      categories: categories as any,
      aadhaarNumber: aadhaar_number
    }
  })

  return ApiResponse.success(res, 'Profile updated', updated)
}

export const submitReview = async (req: Request, res: Response) => {
  const userId = req.user!.id

  const provider = await prisma.providerProfile.findUnique({
    where: { userId },
    include: { profile: true }
  })

  if (!provider) {
    throw new NotFoundError('Provider profile not found')
  }

  // Validate onboarding fields
  if (!provider.profile.fullName || provider.profile.fullName.trim() === '' || !provider.profile.phone || provider.profile.phone.startsWith('temp_')) {
    throw new AppError('Personal details (name, phone) must be completed first', 400)
  }
  if (!provider.categories || provider.categories.length === 0) {
    throw new AppError('At least one service category must be selected', 400)
  }
  if (!provider.serviceAreas || provider.serviceAreas.length === 0) {
    throw new AppError('At least one service area must be served', 400)
  }
  if (!provider.aadhaarNumber || !provider.upiId) {
    throw new AppError('Verification details (Aadhaar, UPI) must be completed first', 400)
  }

  const updated = await prisma.providerProfile.update({
    where: { userId },
    data: { status: 'active' }
  })

  return ApiResponse.success(res, 'Profile submitted and approved', updated)
}

export const uploadDocument = async (req: Request, res: Response) => {
  const providerId = req.user!.id
  const { type, url } = req.body

  const doc = await prisma.providerDocument.create({
    data: { providerId, type, url }
  })

  return ApiResponse.success(res, 'Document uploaded', doc, 201)
}

export const getEarnings = async (req: Request, res: Response) => {
  const providerId = req.user!.id
  const { period } = req.query

  let dateFilter = new Date(0) // Default to all time
  if (period === 'week') {
    dateFilter = new Date()
    dateFilter.setDate(dateFilter.getDate() - 7)
  } else if (period === 'month') {
    dateFilter = new Date()
    dateFilter.setMonth(dateFilter.getMonth() - 1)
  }

  const payments = await prisma.payment.findMany({
    where: {
      payeeId: providerId,
      status: 'paid',
      paidAt: { gte: dateFilter }
    },
    include: { job: { select: { category: true } } }
  })

  const totalEarned = payments.reduce((sum, p) => sum + Number(p.providerPayout), 0)

  return ApiResponse.success(res, 'Earnings fetched', {
    total_earned: totalEarned,
    payments
  })
}

export const getJobs = async (req: Request, res: Response) => {
  const providerId = req.user!.id

  const jobs = await prisma.job.findMany({
    where: {
      offers: { some: { providerId, status: 'accepted' } }
    },
    orderBy: { createdAt: 'desc' }
  })

  return ApiResponse.success(res, 'Jobs fetched', jobs)
}
