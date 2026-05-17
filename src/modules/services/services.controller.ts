import { Request, Response } from 'express'
import { prisma } from '../../config/prisma'
import { ApiResponse } from '../../utils/apiResponse'
import { NotFoundError } from '../../utils/errors'
import { ServiceCategory } from '@prisma/client'

export const getServices = async (req: Request, res: Response) => {
  const { category } = req.query

  const filter = { isActive: true }
  if (category) {
    (filter as any).category = category as string
  }

  const services = await prisma.service.findMany({
    where: filter,
    orderBy: { displayOrder: 'asc' },
  })

  // Group by category if no specific category filter
  if (!category) {
    const grouped = services.reduce((acc, service) => {
      const cat = service.category
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(service)
      return acc
    }, {} as Record<string, typeof services>)
    
    return ApiResponse.success(res, 'Services fetched', grouped)
  }

  return ApiResponse.success(res, 'Services fetched', services)
}

export const getService = async (req: Request, res: Response) => {
  const { id } = req.params
  const service = await prisma.service.findUnique({ where: { id } })
  if (!service) throw new NotFoundError('Service not found')
  
  return ApiResponse.success(res, 'Service fetched', service)
}

// Admin only
export const createService = async (req: Request, res: Response) => {
  const service = await prisma.service.create({ data: req.body })
  return ApiResponse.success(res, 'Service created', service, 201)
}

export const updateService = async (req: Request, res: Response) => {
  const { id } = req.params
  const service = await prisma.service.update({
    where: { id },
    data: req.body,
  })
  return ApiResponse.success(res, 'Service updated', service)
}
