import { Request, Response, NextFunction } from 'express'
import { ZodTypeAny, ZodError } from 'zod'
import { ValidationError } from '../utils/errors'

export const validate = (schema: ZodTypeAny) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync({
        ...req.params,
        ...req.query,
        ...req.body,
      })

      // Assign parsed/coerced/defaulted values back to their respective sources
      for (const key of Object.keys(validated)) {
        if (key in req.params) {
          req.params[key] = validated[key]
        } else if (req.method === 'GET' || req.method === 'DELETE') {
          req.query[key] = validated[key]
        } else {
          req.body[key] = validated[key]
        }
      }

      next()
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }))
        next(new ValidationError('Validation Error', errorMessages))
      } else {
        next(error)
      }
    }
  }
}
