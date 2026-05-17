import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import swaggerUi from 'swagger-ui-express'
import swaggerDocument from './docs/swagger.json'

import { env } from './config/env'
import { apiLimiter } from './middleware/rateLimiter'
import { errorHandler } from './middleware/errorHandler'

// Route Imports
import authRoutes from './modules/auth/auth.routes'
import servicesRoutes from './modules/services/services.routes'
import jobsRoutes from './modules/jobs/jobs.routes'
import offersRoutes from './modules/offers/offers.routes'
import paymentsRoutes from './modules/payments/payments.routes'
import providersRoutes from './modules/providers/providers.routes'
import reviewsRoutes from './modules/reviews/reviews.routes'
import notificationsRoutes from './modules/notifications/notifications.routes'
import adminRoutes from './modules/admin/admin.routes'

const app = express()

// Middlewares
app.use(helmet())
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
)

// Webhook parser before JSON body parser
app.use(['/api/v1/payments/webhook', '/payments/webhook'], express.raw({ type: 'application/json' }))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'))
}

app.use(apiLimiter)

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() })
})

// Routes
const apiRouter = express.Router()

apiRouter.use('/auth', authRoutes)
apiRouter.use('/services', servicesRoutes)
apiRouter.use('/jobs', jobsRoutes)
apiRouter.use('/offers', offersRoutes)
apiRouter.use('/payments', paymentsRoutes)
apiRouter.use('/providers', providersRoutes)
apiRouter.use('/reviews', reviewsRoutes)
apiRouter.use('/notifications', notificationsRoutes)
apiRouter.use('/admin', adminRoutes)

app.use('/api/v1', apiRouter)
app.use('/', apiRouter)

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

// Global Error Handler
app.use(errorHandler)

export default app
