import rateLimit from 'express-rate-limit'

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // 5 requests per IP
  message: {
    success: false,
    message: 'Too many auth requests from this IP, please try again after 15 minutes',
  },
})

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 100, // 100 requests per IP per minute
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 1 minute',
  },
})
