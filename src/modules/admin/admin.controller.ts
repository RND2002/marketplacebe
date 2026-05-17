import { Request, Response } from 'express'
import crypto from 'crypto'
import { prisma } from '../../config/prisma'
import { supabaseAdmin } from '../../config/supabase'
import { ApiResponse } from '../../utils/apiResponse'
import { env } from '../../config/env'
import { AppError, ConflictError, NotFoundError } from '../../utils/errors'
import { whatsappService } from '../notifications/whatsapp.service'

export const getDashboard = async (req: Request, res: Response) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    todayJobsCount, todayCompletedJobs, todayRevenueAggr, todayProviders, todayCustomers,
    totalJobs, totalProviders, totalCustomers, totalRevenueAggr,
    pendingProviders, openDisputes
  ] = await Promise.all([
    prisma.job.count({ where: { createdAt: { gte: today } } }),
    prisma.job.count({ where: { status: 'completed', completedAt: { gte: today } } }),
    prisma.payment.aggregate({ _sum: { commissionAmount: true }, where: { status: 'paid', paidAt: { gte: today } } }),
    prisma.profile.count({ where: { role: 'provider', createdAt: { gte: today } } }),
    prisma.profile.count({ where: { role: 'customer', createdAt: { gte: today } } }),
    
    prisma.job.count(),
    prisma.profile.count({ where: { role: 'provider' } }),
    prisma.profile.count({ where: { role: 'customer' } }),
    prisma.payment.aggregate({ _sum: { commissionAmount: true }, where: { status: 'paid' } }),
    
    prisma.providerProfile.count({ where: { status: 'pending_review' } }),
    // Mock open disputes as 0 for now since dispute table wasn't in schema
    Promise.resolve(0)
  ])

  return ApiResponse.success(res, 'Dashboard stats fetched', {
    today: {
      new_jobs: todayJobsCount,
      completed_jobs: todayCompletedJobs,
      revenue: Number(todayRevenueAggr._sum.commissionAmount || 0),
      new_providers: todayProviders,
      new_customers: todayCustomers
    },
    total: {
      jobs: totalJobs,
      providers: totalProviders,
      customers: totalCustomers,
      revenue: Number(totalRevenueAggr._sum.commissionAmount || 0)
    },
    pending_provider_approvals: pendingProviders,
    open_disputes: openDisputes
  })
}

export const createProvider = async (req: Request, res: Response) => {
  const adminId = req.user!.id
  const { full_name, phone, categories, years_experience, service_areas } = req.body

  const existingPhone = await prisma.profile.findUnique({ where: { phone } })
  if (existingPhone) throw new ConflictError('Phone already registered')

  const fakeEmail = `${phone}@${env.PROVIDER_EMAIL_DOMAIN}`
  const tempPassword = crypto.randomBytes(Math.ceil(env.TEMP_PASSWORD_LENGTH/2)).toString('hex').slice(0, env.TEMP_PASSWORD_LENGTH)

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: fakeEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name, phone, role: 'provider' }
  })

  if (authError || !authData.user) {
    throw new AppError(authError?.message || 'Failed to create provider auth', 500)
  }

  const result = await prisma.$transaction(async (tx) => {
    const profile = await tx.profile.create({
      data: { id: authData.user.id, role: 'provider', fullName: full_name, phone }
    })

    const providerProfile = await tx.providerProfile.create({
      data: {
        userId: profile.id,
        status: 'pending_review',
        categories: categories as any[],
        yearsExperience: years_experience || 0,
        serviceAreas: service_areas || []
      }
    })

    await tx.adminLog.create({
      data: {
        adminId, action: 'CREATE_PROVIDER', targetType: 'provider', targetId: profile.id
      }
    })

    return { profile, providerProfile }
  })

  await whatsappService.sendWhatsApp(phone, `Namaskar ${full_name}! Aapka Fixkar account ban gaya hai. Login karne ke liye:\nEmail: ${fakeEmail}\nPassword: ${tempPassword}\nPlease login karke apna password badlein.`)

  return ApiResponse.success(res, 'Provider created', {
    provider_profile: result.providerProfile,
    temp_password: tempPassword // Show only once
  }, 201)
}

export const approveProvider = async (req: Request, res: Response) => {
  const { id } = req.params
  const adminId = req.user!.id

  const providerProfile = await prisma.providerProfile.findUnique({ where: { userId: id }, include: { profile: true } })
  if (!providerProfile) throw new NotFoundError('Provider not found')

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.providerProfile.update({
      where: { userId: id },
      data: { status: 'active' }
    })
    await tx.adminLog.create({
      data: { adminId, action: 'APPROVE_PROVIDER', targetType: 'provider', targetId: id }
    })
    return p
  })

  await whatsappService.sendProviderApproved(providerProfile.profile.phone, providerProfile.profile.fullName)

  return ApiResponse.success(res, 'Provider approved', updated)
}

export const suspendProvider = async (req: Request, res: Response) => {
  const { id } = req.params
  const { reason } = req.body
  const adminId = req.user!.id

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.providerProfile.update({
      where: { userId: id },
      data: { status: 'suspended' }
    })
    await tx.adminLog.create({
      data: { adminId, action: 'SUSPEND_PROVIDER', targetType: 'provider', targetId: id, notes: reason }
    })
    return p
  })

  return ApiResponse.success(res, 'Provider suspended', updated)
}

export const getProviders = async (req: Request, res: Response) => {
  const { status, category } = req.query

  const filter: any = {}
  if (status) filter.status = status
  if (category) filter.categories = { has: category }

  const providers = await prisma.providerProfile.findMany({
    where: filter,
    include: { profile: true },
    orderBy: { createdAt: 'desc' }
  })

  return ApiResponse.success(res, 'Providers fetched', providers)
}

export const getJobs = async (req: Request, res: Response) => {
  const { status, category, page = 1, limit = 20 } = req.query

  const filter: any = {}
  if (status) filter.status = status
  if (category) filter.category = category

  const jobs = await prisma.job.findMany({
    where: filter,
    include: { customer: true, service: true },
    orderBy: { createdAt: 'desc' },
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit)
  })

  const total = await prisma.job.count({ where: filter })

  return ApiResponse.success(res, 'Jobs fetched', jobs, 200, {
    page: Number(page),
    limit: Number(limit),
    total
  })
}

export const getPayments = async (req: Request, res: Response) => {
  const { page = 1, limit = 20 } = req.query

  const payments = await prisma.payment.findMany({
    include: { payer: true, payee: true, job: true },
    orderBy: { createdAt: 'desc' },
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit)
  })

  const total = await prisma.payment.count()

  return ApiResponse.success(res, 'Payments fetched', payments, 200, {
    page: Number(page),
    limit: Number(limit),
    total
  })
}
