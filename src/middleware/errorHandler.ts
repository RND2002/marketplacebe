import { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'
import { ApiResponse } from '../utils/apiResponse'
import { env } from '../config/env'

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  let statusCode = 500
  let message = 'Internal Server Error'
  let errors = null

  if (err instanceof AppError) {
    statusCode = err.statusCode
    message = err.message
    if (err.statusCode === 400 && 'errors' in err) {
      errors = (err as any).errors
    }
  } else if (err.code === '23505') {
    // Prisma unique constraint violation (actually Prisma throws P2002)
    // Supabase JS might throw Postgres errors
    statusCode = 409
    message = 'Resource already exists'
  } else if (err.code === 'P2002') {
    statusCode = 409
    message = 'Resource already exists'
  }

  // Log the error
  if (statusCode === 500) {
    logger.error(`[${req.method}] ${req.url} >> StatusCode:: ${statusCode}, Message:: ${err.message}`, err)
  } else {
    logger.warn(`[${req.method}] ${req.url} >> StatusCode:: ${statusCode}, Message:: ${message}`)
  }

  const responseData = {
    ...(errors && { errors }),
    ...(env.NODE_ENV === 'development' && statusCode === 500 && { stack: err.stack }),
  }

  return ApiResponse.error(
    res,
    message,
    statusCode,
    Object.keys(responseData).length > 0 ? responseData : null
  )
}
