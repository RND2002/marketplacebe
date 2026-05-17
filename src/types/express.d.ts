import { UserContext } from './user.types'

declare global {
  namespace Express {
    interface Request {
      user?: UserContext
    }
  }
}
