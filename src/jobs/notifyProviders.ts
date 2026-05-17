import { supabaseAdmin } from '../config/supabase'
import { whatsappService } from '../modules/notifications/whatsapp.service'
import { pushService } from '../modules/notifications/push.service'
import { env } from '../config/env'

export async function notifyNearbyProviders(job: any): Promise<void> {
  // 1. Find providers within radius using PostGIS
  const { data: providers, error } = await supabaseAdmin.rpc('find_nearby_providers', {
    job_lat: job.location.lat,
    job_lng: job.location.lng,
    radius_km: Number(env.PROVIDER_SEARCH_RADIUS_KM),
    category: job.category
  })

  if (error || !providers) {
    console.error('Error fetching nearby providers via RPC:', error)
    return
  }

  // Take top N by proximity + rating
  const topProviders = providers.slice(0, env.MAX_PROVIDERS_NOTIFIED)
  if (topProviders.length === 0) return

  // 2. Record notifications to prevent duplicates
  await supabaseAdmin.from('job_provider_notifications').insert(
    topProviders.map((p: any) => ({ job_id: job.id, provider_id: p.id }))
  )

  // 3 & 4. Send notifications
  for (const provider of topProviders) {
    await whatsappService.sendNewJobAlert(provider.phone, job)
    
    // Attempt push notification if fcm_token was tracked in profile metadata (mocking retrieval)
    // In actual implementation, fetch FCM token from profiles or devices
    // const fcm_token = provider.fcm_token
    // if (fcm_token) {
    //   await pushService.sendToDevice(fcm_token, 'New job near you!', `${job.service_name} · ${job.address} · ₹${job.budget} budget`)
    // }
  }
}
