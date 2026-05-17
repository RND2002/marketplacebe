import { Response } from 'express'

export interface ApiResponseData<T = null> {
  success: boolean
  message: string
  data: T | null
  meta?: {
    total?: number
    page?: number
    limit?: number
  }
}

export class ApiResponse {
  static success<T>(
    res: Response,
    message: string,
    data: T | null = null,
    statusCode = 200,
    meta?: ApiResponseData['meta']
  ) {
    const response: ApiResponseData<T> = {
      success: true,
      message,
      data,
      ...(meta && { meta }),
    }
    return res.status(statusCode).json(response)
  }

  static error(res: Response, message: string, statusCode = 500, errorData: any = null) {
    const response: ApiResponseData<any> = {
      success: false,
      message,
      data: errorData,
    }
    return res.status(statusCode).json(response)
  }
}
