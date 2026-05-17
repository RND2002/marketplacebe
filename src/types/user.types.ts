export type UserRole = 'customer' | 'provider' | 'admin'

export interface UserContext {
  id: string
  role: UserRole
  email: string
  phone?: string
}
