import winston from 'winston'
import { env } from '../config/env'

const { combine, timestamp, printf, colorize, errors } = winston.format

const customFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`
})

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    env.NODE_ENV === 'development' ? colorize() : winston.format.uncolorize(),
    customFormat
  ),
  transports: [
    new winston.transports.Console(),
    // In production, we could add file transports here
    // new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
})
