import app from './app'
import { env } from './config/env'
import { logger } from './utils/logger'
import { prisma } from './config/prisma'

const startServer = async () => {
  try {
    // Check DB connection
    await prisma.$connect()
    logger.info('Connected to Database via Prisma')

    app.listen(env.PORT, () => {
      logger.info(`Server is running on port ${env.PORT} in ${env.NODE_ENV} mode`)
    })
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason)
  // Close server & exit process if necessary
})

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err)
  process.exit(1)
})

startServer()
