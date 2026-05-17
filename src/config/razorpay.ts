import Razorpay from 'razorpay'
import { env } from './env'

const isMock = env.RAZORPAY_KEY_ID === 'rzp_test_xxxxxxxxxxxx' || env.RAZORPAY_KEY_SECRET === 'your_razorpay_secret'

class MockRazorpayOrders {
  async create(options: any) {
    return {
      id: `order_mock_${Math.random().toString(36).substring(2, 10)}`,
      entity: 'order',
      amount: options.amount,
      amount_paid: 0,
      amount_due: options.amount,
      currency: options.currency || 'INR',
      receipt: options.receipt,
      status: 'created',
      attempts: 0,
      notes: [],
      created_at: Math.floor(Date.now() / 1000)
    }
  }
}

let razorpayInstance: any

if (isMock) {
  razorpayInstance = {
    orders: new MockRazorpayOrders()
  }
} else {
  razorpayInstance = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  })
}

export const razorpay = razorpayInstance

