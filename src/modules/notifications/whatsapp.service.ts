import axios from 'axios'
import { env } from '../../config/env'
import { logger } from '../../utils/logger'

export const sendWhatsApp = async (phone: string, message: string) => {
  if (env.NODE_ENV === 'test') return

  try {
    const url = `https://api.gupshup.io/sm/api/v1/msg`
    const data = new URLSearchParams()
    data.append('channel', 'whatsapp')
    data.append('source', env.GUPSHUP_SOURCE_NUMBER)
    data.append('destination', phone)
    data.append('message', JSON.stringify({ type: 'text', text: message }))
    data.append('src.name', env.GUPSHUP_APP_NAME)

    await axios.post(url, data, {
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/x-www-form-urlencoded',
        apikey: env.GUPSHUP_API_KEY,
      },
    })
    logger.info(`WhatsApp sent to ${phone}`)
  } catch (error: any) {
    logger.error(`Failed to send WhatsApp to ${phone}: ${error.message}`)
  }
}

export const whatsappService = {
  sendWhatsApp,
  sendNewJobAlert: async (phone: string, job: any) => {
    const msg = `Namaskar! Aapke paas ek naya kaam hai 🔧\nService: ${job.serviceName}\nLocation: ${job.address}\nBudget: ₹${job.budget}\nApp kholein aur offer karein!`
    return sendWhatsApp(phone, msg)
  },
  sendOfferReceived: async (phone: string, offer: any) => {
    const msg = `Aapko ek naya offer mila hai!\nProvider: ${offer.providerName}\nPrice: ₹${offer.price}\nNote: ${offer.note || ''}`
    return sendWhatsApp(phone, msg)
  },
  sendOfferAccepted: async (phone: string, job: any, customerPhone: string) => {
    const msg = `Badhai ho! Aapka offer accept ho gaya hai.\nCustomer Number: ${customerPhone}\nLocation: ${job.address}\nJaldi se kaam complete karein!`
    return sendWhatsApp(phone, msg)
  },
  sendJobConfirmed: async (phone: string, providerName: string) => {
    const msg = `Aapka provider confirm ho gaya hai.\nProvider: ${providerName}\nWoh jald hi aapse contact karenge.`
    return sendWhatsApp(phone, msg)
  },
  sendPartsRequest: async (phone: string, partsDescription: string, partsCost: number) => {
    const msg = `Provider ne parts ke liye request ki hai.\nItems: ${partsDescription}\nCost: ₹${partsCost}\nKripya app mein approve karein.`
    return sendWhatsApp(phone, msg)
  },
  sendJobCompleted: async (phone: string, job: any) => {
    const msg = `Kaam complete ho gaya hai!\nKripya payment complete karein aur provider ko review dein.`
    return sendWhatsApp(phone, msg)
  },
  sendProviderApproved: async (phone: string, name: string) => {
    const msg = `Badhai ho ${name}! Aapka Fixkar account approve ho gaya. Ab aap app mein login karke kaam receive kar sakte hain.`
    return sendWhatsApp(phone, msg)
  },
  sendWelcome: async (phone: string, name: string) => {
    const msg = `Namaskar ${name}! Fixkar mein aapka swagat hai.`
    return sendWhatsApp(phone, msg)
  },
}
