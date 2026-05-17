import { firebaseAdmin } from '../../config/firebase'
import { logger } from '../../utils/logger'

export const pushService = {
  sendToDevice: async (fcmToken: string, title: string, body: string, data: any = {}) => {
    try {
      await firebaseAdmin.messaging().send({
        token: fcmToken,
        notification: { title, body },
        data: {
          ...data,
          // ensure all data values are strings for FCM
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
      })
      logger.info(`Push sent to ${fcmToken.substring(0, 10)}...`)
    } catch (error: any) {
      logger.error(`Failed to send push notification: ${error.message}`)
    }
  },
}
