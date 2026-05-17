import { Request, Response } from 'express'
import crypto from 'crypto'
import { prisma } from '../../config/prisma'
import { razorpay } from '../../config/razorpay'
import { env } from '../../config/env'
import { ApiResponse } from '../../utils/apiResponse'
import { AppError, NotFoundError, ForbiddenError, ConflictError } from '../../utils/errors'
import { whatsappService } from '../notifications/whatsapp.service'

// Helper to create in-app notifications
const notifyUser = async (userId: string, type: string, title: string, body: string) => {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
      }
    })
  } catch (err: any) {
    console.error('Failed to create in-app notification:', err.message)
  }
}

export const makeOffer = async (req: Request, res: Response) => {
  const providerId = req.user!.id
  const { type, job_id, price, note, visit_note } = req.body

  const job = await prisma.job.findUnique({
    where: { id: job_id },
    include: { service: true, customer: true }
  })

  if (!job) throw new NotFoundError('Job not found')
  if (job.status !== 'open' && job.status !== 'offered') {
    throw new ConflictError('This job is no longer accepting offers')
  }

  const providerProfile = await prisma.providerProfile.findUnique({
    where: { userId: providerId },
    include: { profile: true }
  })
  if (!providerProfile) throw new ForbiddenError('Provider profile not found')
  if (providerProfile.status !== 'active') {
    throw new ForbiddenError('Your account must be active to make offers')
  }

  const existingOffer = await prisma.offer.findUnique({
    where: { jobId_providerId: { jobId: job_id, providerId } }
  })
  if (existingOffer) throw new ConflictError('You have already made an offer on this job')

  const totalOffers = await prisma.offer.count({ where: { jobId: job_id } })
  if (totalOffers >= 10) {
    throw new AppError('This job has reached the maximum limit of 10 offers', 400)
  }

  if (type === 'offer') {
    if (!price || price <= 0) {
      throw new AppError('Price is required and must be positive', 400)
    }
    const minPrice = Number(job.service.minPrice)
    if (price < minPrice) {
      throw new AppError(`Minimum price for this service is ₹${minPrice}`, 400)
    }

    const offer = await prisma.$transaction(async (tx) => {
      const isFixed = job.jobType === 'fixed'
      const status = isFixed ? 'accepted' : 'pending'

      const newOffer = await tx.offer.create({
        data: {
          jobId: job_id,
          providerId,
          price,
          note,
          status,
          isVisitRequest: false,
          finalPrice: isFixed ? price : null
        },
        include: { provider: true }
      })

      if (isFixed) {
        await tx.job.update({
          where: { id: job_id },
          data: {
            status: 'confirmed',
            acceptedOfferId: newOffer.id,
            agreedPrice: price,
            finalPrice: price,
            confirmedAt: new Date()
          }
        })
        await tx.offer.updateMany({
          where: { jobId: job_id, id: { not: newOffer.id } },
          data: { status: 'declined' }
        })
      } else {
        if (job.status === 'open') {
          await tx.job.update({
            where: { id: job_id },
            data: { status: 'offered' }
          })
        }
      }
      return newOffer
    })

    if (job.jobType === 'fixed') {
      await whatsappService.sendOfferAccepted(offer.provider.phone, { ...job, agreedPrice: price } as any, job.customer.phone)
      await whatsappService.sendJobConfirmed(job.customer.phone, offer.provider.fullName)
      await notifyUser(job.customerId, 'job_confirmed', 'Job confirmed!', `${offer.provider.fullName} confirmed for fixed price ₹${price}`)
    } else {
      await whatsappService.sendOfferReceived(job.customer.phone, {
        providerName: providerProfile.profile.fullName,
        price,
        note
      })
      await notifyUser(job.customerId, 'offer_received', 'New offer received!', `${providerProfile.profile.fullName} offered ₹${price} for your ${job.service.name}`)
    }

    return ApiResponse.success(res, job.jobType === 'fixed' ? 'Job confirmed successfully' : 'Offer submitted successfully', offer, 201)

  } else if (type === 'visit_request') {
    if (job.jobType !== 'assessment') {
      throw new AppError('Site visit requests are only allowed for assessment jobs', 400)
    }

    const offer = await prisma.$transaction(async (tx) => {
      const newOffer = await tx.offer.create({
        data: {
          jobId: job_id,
          providerId,
          status: 'visit_requested',
          isVisitRequest: true,
          visitNote: visit_note,
        },
        include: { provider: true }
      })

      await tx.job.update({
        where: { id: job_id },
        data: {
          status: 'offered',
          visitRequestedById: providerId,
          visitRequestedAt: new Date()
        }
      })

      return newOffer
    })

    const msg = `${providerProfile.profile.fullName} wants to visit and assess your ${job.service.name} problem`
    await whatsappService.sendWhatsApp(job.customer.phone, `🔍 Site Visit Request!\n${msg}\nVisiting charge of ₹${job.service.visitingCharge || 99} applies. App open karke confirm karein.`)
    await notifyUser(job.customerId, 'visit_requested', 'Site Visit Requested', msg)

    return ApiResponse.success(res, 'Site visit request submitted successfully', offer, 201)
  }
}

export const acceptOffer = async (req: Request, res: Response) => {
  const { id } = req.params
  const customerId = req.user!.id

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { job: { include: { customer: true, service: true } }, provider: true }
  })

  if (!offer) throw new NotFoundError('Offer not found')
  if (offer.job.customerId !== customerId) throw new ForbiddenError('Access denied')
  if (offer.status !== 'pending' && offer.status !== 'countered') {
    throw new AppError(`Cannot accept offer with status ${offer.status}`, 400)
  }

  const agreedPrice = offer.status === 'countered' && offer.counterPrice ? offer.counterPrice : offer.price
  if (!agreedPrice) throw new AppError('Agreed price is invalid', 400)

  const updatedJob = await prisma.$transaction(async (tx) => {
    await tx.offer.updateMany({
      where: { jobId: offer.jobId, id: { not: offer.id } },
      data: { status: 'declined' }
    })

    await tx.offer.update({
      where: { id: offer.id },
      data: { status: 'accepted', finalPrice: agreedPrice }
    })

    const updatedJb = await tx.job.update({
      where: { id: offer.jobId },
      data: {
        status: 'confirmed',
        acceptedOfferId: offer.id,
        agreedPrice,
        finalPrice: agreedPrice,
        confirmedAt: new Date()
      }
    })
    
    return updatedJb
  })

  // Revealing contact details
  await whatsappService.sendWhatsApp(offer.provider.phone, `🎉 Badhai ho! ${offer.job.customer.fullName} ne aapka offer accept kar liya!\nService: ${offer.job.service.name}\nAddress: ${offer.job.address}\nAgreed price: ₹${agreedPrice}\nCustomer phone: ${offer.job.customer.phone}\nKripya reach out karein aur arrival time confirm karein.`)
  await whatsappService.sendWhatsApp(offer.job.customer.phone, `✅ ${offer.provider.fullName} ka offer confirm ho gaya!\nWoh jald hi aapke paas aayenge.\nProvider phone: ${offer.provider.phone}\nAgreed price: ₹${agreedPrice}`)

  await notifyUser(offer.providerId, 'offer_accepted', 'Offer Accepted!', `${offer.job.customer.fullName} accepted your offer for ₹${agreedPrice}`)
  await notifyUser(offer.job.customerId, 'job_confirmed', 'Job Confirmed!', `Job confirmed at ₹${agreedPrice} with ${offer.provider.fullName}`)

  return ApiResponse.success(res, 'Offer accepted successfully', { job: updatedJob, accepted_offer: offer })
}

export const declineOffer = async (req: Request, res: Response) => {
  const { id } = req.params
  const customerId = req.user!.id

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { job: true, provider: true }
  })
  if (!offer || offer.job.customerId !== customerId) throw new NotFoundError('Offer not found')

  const updatedOffer = await prisma.offer.update({
    where: { id },
    data: { status: 'declined' }
  })

  await notifyUser(offer.providerId, 'offer_declined', 'Offer Declined', `Your offer on job for ${offer.job.address} was declined.`)

  return ApiResponse.success(res, 'Offer declined successfully', updatedOffer)
}

export const counterOffer = async (req: Request, res: Response) => {
  const { id } = req.params
  const { counter_price, counter_note } = req.body
  const customerId = req.user!.id

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { job: { include: { customer: true, service: true } }, provider: true }
  })
  if (!offer || offer.job.customerId !== customerId) throw new NotFoundError('Offer not found')
  if (Number(offer.counterRound) > 0) {
    throw new ConflictError('Counter offer already sent for this offer')
  }

  const minPrice = Number(offer.job.service.minPrice)
  if (counter_price < minPrice) {
    throw new AppError(`Counter price below minimum of ₹${minPrice}`, 400)
  }
  if (offer.price && counter_price >= Number(offer.price)) {
    throw new AppError('Counter price must be lower than the provider\'s offer price', 400)
  }

  const updatedOffer = await prisma.offer.update({
    where: { id },
    data: {
      status: 'countered',
      counterPrice: counter_price,
      counterNote: counter_note,
      counterRound: 1
    }
  })

  await whatsappService.sendWhatsApp(offer.provider.phone, `💬 Counter Offer Received!\n${offer.job.customer.fullName} ne counter offer bheja!\nAapka offer: ₹${offer.price}\nUnka counter: ₹${counter_price}\nApp mein accept ya decline karein.`)
  await notifyUser(offer.providerId, 'counter_received', 'Counter Offer Received', `${offer.job.customer.fullName} countered at ₹${counter_price}`)

  return ApiResponse.success(res, 'Counter offer sent successfully', updatedOffer)
}

export const counterRespond = async (req: Request, res: Response) => {
  const { id } = req.params
  const { accepted } = req.body
  const providerId = req.user!.id

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { job: { include: { customer: true, service: true } }, provider: true }
  })
  if (!offer || offer.providerId !== providerId) throw new NotFoundError('Offer not found')
  if (offer.status !== 'countered') throw new AppError('No counter offer to respond to', 400)
  if (offer.job.status === 'confirmed') throw new AppError('Job is already confirmed', 400)

  if (accepted) {
    const agreedPrice = Number(offer.counterPrice)
    if (!agreedPrice) throw new AppError('Invalid counter price', 400)

    const updatedJob = await prisma.$transaction(async (tx) => {
      await tx.offer.updateMany({
        where: { jobId: offer.jobId, id: { not: offer.id } },
        data: { status: 'declined' }
      })

      const uo = await tx.offer.update({
        where: { id: offer.id },
        data: { status: 'accepted', finalPrice: agreedPrice }
      })

      const uj = await tx.job.update({
        where: { id: offer.jobId },
        data: {
          status: 'confirmed',
          acceptedOfferId: offer.id,
          agreedPrice,
          finalPrice: agreedPrice,
          confirmedAt: new Date()
        }
      })
      return uj
    })

    await whatsappService.sendWhatsApp(offer.provider.phone, `🎉 Badhai ho! Job confirm ho gaya!\nCustomer: ${offer.job.customer.fullName}\nAddress: ${offer.job.address}\nAgreed price: ₹${agreedPrice}\nCustomer phone: ${offer.job.customer.phone}`)
    await whatsappService.sendWhatsApp(offer.job.customer.phone, `✅ ${offer.provider.fullName} ne counter offer accept kar liya!\nWoh jald hi aapse contact karenge.\nProvider phone: ${offer.provider.phone}\nAgreed price: ₹${agreedPrice}`)

    await notifyUser(offer.providerId, 'offer_accepted', 'Counter Accepted!', `Job confirmed at ₹${agreedPrice}`)
    await notifyUser(offer.job.customerId, 'job_confirmed', 'Counter Accepted!', `${offer.provider.fullName} accepted your counter of ₹${agreedPrice}`)

    return ApiResponse.success(res, 'Counter offer accepted', { job: updatedJob, offer })
  } else {
    const updatedOffer = await prisma.offer.update({
      where: { id },
      data: { status: 'declined' }
    })

    await whatsappService.sendWhatsApp(offer.job.customer.phone, `❌ ${offer.provider.fullName} ne counter offer decline kar diya. Doosre offers check karein.`)
    await notifyUser(offer.job.customerId, 'counter_declined', 'Counter Declined', `${offer.provider.fullName} declined your counter offer.`)

    return ApiResponse.success(res, 'Counter offer declined', updatedOffer)
  }
}

export const withdrawOffer = async (req: Request, res: Response) => {
  const { id } = req.params
  const providerId = req.user!.id

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { job: true }
  })
  if (!offer || offer.providerId !== providerId) throw new NotFoundError('Offer not found')
  if (offer.status !== 'pending' && offer.status !== 'countered') {
    throw new AppError(`Cannot withdraw offer with status ${offer.status}`, 400)
  }

  const updatedOffer = await prisma.offer.update({
    where: { id },
    data: { status: 'withdrawn' }
  })

  // If this was the only offer, update job status back to 'open'
  const activeOffersCount = await prisma.offer.count({
    where: { jobId: offer.jobId, status: { in: ['pending', 'countered', 'visit_requested'] } }
  })
  if (activeOffersCount === 0 && offer.job.status === 'offered') {
    await prisma.job.update({
      where: { id: offer.jobId },
      data: { status: 'open' }
    })
  }

  await notifyUser(offer.job.customerId, 'offer_withdrawn', 'Offer Withdrawn', 'An offer on your job post was withdrawn.')

  return ApiResponse.success(res, 'Offer withdrawn successfully', updatedOffer)
}

export const confirmVisit = async (req: Request, res: Response) => {
  const { id } = req.params
  const customerId = req.user!.id

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { job: { include: { customer: true, service: true } }, provider: true }
  })

  if (!offer) throw new NotFoundError('Offer not found')
  if (offer.job.customerId !== customerId) throw new ForbiddenError('Access denied')
  if (offer.status !== 'visit_requested') {
    throw new AppError('No visit request is pending for this offer', 400)
  }

  const visitingCharge = Number(offer.job.service.visitingCharge || 99)

  const orderOptions = {
    amount: Math.round(visitingCharge * 100), // paise
    currency: 'INR',
    receipt: `receipt_visit_${offer.job.id.substring(0, 8)}_${Date.now()}`,
  }

  const razorpayOrder = await razorpay.orders.create(orderOptions)

  const payment = await prisma.payment.create({
    data: {
      jobId: offer.jobId,
      payerId: customerId,
      payeeId: offer.providerId,
      amount: visitingCharge,
      type: 'visiting_charge',
      status: 'pending',
      razorpayOrderId: razorpayOrder.id,
    }
  })

  return ApiResponse.success(res, 'Visit confirmation order created', {
    offer,
    razorpay_order: {
      id: razorpayOrder.id,
      amount: orderOptions.amount,
      currency: orderOptions.currency,
      key_id: env.RAZORPAY_KEY_ID,
      payment_id: payment.id,
    }
  })
}

export const confirmVisitPayment = async (req: Request, res: Response) => {
  const { id } = req.params
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body

  const isMock = env.RAZORPAY_KEY_ID === 'rzp_test_xxxxxxxxxxxx' || env.RAZORPAY_KEY_SECRET === 'your_razorpay_secret'

  const generatedSignature = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex')

  if (!isMock && generatedSignature !== razorpay_signature) {
    throw new AppError('Invalid payment signature', 400)
  }

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { job: { include: { customer: true, service: true } }, provider: true }
  })
  if (!offer) throw new NotFoundError('Offer not found')

  const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: razorpay_order_id } })
  if (!payment) throw new NotFoundError('Payment record not found')

  const updatedOffer = await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'paid',
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paidAt: new Date()
      }
    })

    const uOffer = await tx.offer.update({
      where: { id: offer.id },
      data: { status: 'visit_confirmed' }
    })

    await tx.job.update({
      where: { id: offer.jobId },
      data: {
        visitingChargePaid: true,
        visitConfirmedAt: new Date(),
        visitingCharge: payment.amount
      }
    })

    return uOffer
  })

  const msgText = `Visit confirmed! ${offer.job.customer.fullName} ne ₹${payment.amount} visiting charge pay kar diya hai.`
  await whatsappService.sendWhatsApp(offer.provider.phone, `✅ Visit Confirmed!\n${msgText}\nLocation: ${offer.job.address}\nKripya inspect karke app mein quote submit karein. Phone: ${offer.job.customer.phone}`)
  await whatsappService.sendWhatsApp(offer.job.customer.phone, `✅ Visit confirmed! ${offer.provider.fullName} aapke ghar inspect karne aayenge. Paid ₹${payment.amount}`)

  await notifyUser(offer.providerId, 'visit_confirmed', 'Site Visit Confirmed!', msgText)
  await notifyUser(offer.job.customerId, 'visit_confirmed', 'Site Visit Booked', `${offer.provider.fullName} is coming to inspect.`)

  return ApiResponse.success(res, 'Visit confirmed successfully', { offer: updatedOffer })
}

export const submitSiteQuote = async (req: Request, res: Response) => {
  const { id } = req.params
  const { site_quote, site_quote_note } = req.body
  const providerId = req.user!.id

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { job: { include: { customer: true, service: true } }, provider: true }
  })
  if (!offer || offer.providerId !== providerId) throw new NotFoundError('Offer not found')
  if (offer.status !== 'visit_confirmed') {
    throw new AppError('Job is not in visit_confirmed status', 400)
  }

  const minPrice = Number(offer.job.service.minPrice)
  if (site_quote < minPrice) {
    throw new AppError(`Site quote must be at least ₹${minPrice}`, 400)
  }

  const updatedOffer = await prisma.$transaction(async (tx) => {
    const uo = await tx.offer.update({
      where: { id: offer.id },
      data: {
        status: 'visit_completed',
        siteQuote: site_quote,
        siteQuoteNote: site_quote_note,
        siteQuoteSubmittedAt: new Date()
      }
    })

    await tx.job.update({
      where: { id: offer.jobId },
      data: {
        siteQuote: site_quote,
        visitCompletedAt: new Date()
      }
    })

    return uo
  })

  const remaining = site_quote - Number(offer.job.visitingCharge || 99)
  await whatsappService.sendWhatsApp(offer.job.customer.phone, `🔍 Site Quote Received!\n${offer.provider.fullName} ne visit ke baad quote diya hai.\nQuote: ₹${site_quote}\nVisiting Charge: ₹${offer.job.visitingCharge || 99} paid ✅\nRemaining: ₹${remaining}\nApp mein accept ya decline karein.`)
  await notifyUser(offer.job.customerId, 'site_quote_submitted', 'Site Quote Submitted', `${offer.provider.fullName} quoted ₹${site_quote} for completion.`)

  return ApiResponse.success(res, 'Site quote submitted successfully', updatedOffer)
}

export const acceptSiteQuote = async (req: Request, res: Response) => {
  const { id } = req.params
  const { accepted } = req.body
  const customerId = req.user!.id

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { job: { include: { customer: true, service: true } }, provider: true }
  })
  if (!offer || offer.job.customerId !== customerId) throw new NotFoundError('Offer not found')
  if (offer.status !== 'visit_completed') {
    throw new AppError('Site visit quote has not been submitted or already processed', 400)
  }

  if (accepted) {
    const price = Number(offer.siteQuote)
    if (!price) throw new AppError('Invalid site quote price', 400)

    const updatedJob = await prisma.$transaction(async (tx) => {
      await tx.offer.updateMany({
        where: { jobId: offer.jobId, id: { not: offer.id } },
        data: { status: 'declined' }
      })

      const uo = await tx.offer.update({
        where: { id: offer.id },
        data: { status: 'accepted', finalPrice: price }
      })

      const uj = await tx.job.update({
        where: { id: offer.jobId },
        data: {
          status: 'confirmed',
          acceptedOfferId: offer.id,
          agreedPrice: price,
          finalPrice: price,
          confirmedAt: new Date()
        }
      })

      return uj
    })

    await whatsappService.sendWhatsApp(offer.provider.phone, `🎉 Quote accepted! Job confirmed!\nCustomer: ${offer.job.customer.fullName}\nPhone: ${offer.job.customer.phone}\nFinal price: ₹${price}`)
    await whatsappService.sendWhatsApp(offer.job.customer.phone, `✅ Job confirmed at ₹${price} with ${offer.provider.fullName}!`)

    await notifyUser(offer.providerId, 'quote_accepted', 'Site Quote Accepted!', `Job confirmed at ₹${price}`)
    await notifyUser(offer.job.customerId, 'job_confirmed', 'Job Confirmed!', `Job confirmed with ${offer.provider.fullName}`)

    return ApiResponse.success(res, 'Site quote accepted and job confirmed', { job: updatedJob, offer })
  } else {
    // declined site quote: job gets cancelled
    const updatedJob = await prisma.$transaction(async (tx) => {
      await tx.offer.update({
        where: { id: offer.id },
        data: { status: 'declined' }
      })

      const uj = await tx.job.update({
        where: { id: offer.jobId },
        data: {
          status: 'cancelled',
          cancellationReason: 'Customer declined site quote',
          cancelledAt: new Date()
        }
      })
      return uj
    })

    await whatsappService.sendWhatsApp(offer.provider.phone, `❌ Customer ne site quote decline kar diya. Job cancel ho gaya hai.`)
    await whatsappService.sendWhatsApp(offer.job.customer.phone, `Job cancel ho gaya hai. Visiting charge refundable nahi hai.`)

    await notifyUser(offer.providerId, 'quote_declined', 'Quote Declined', `Customer declined your site quote of ₹${offer.siteQuote}.`)
    await notifyUser(offer.job.customerId, 'job_cancelled', 'Job Cancelled', 'Job cancelled after site quote decline.')

    return ApiResponse.success(res, 'Site quote declined and job cancelled', { job: updatedJob, offer })
  }
}
