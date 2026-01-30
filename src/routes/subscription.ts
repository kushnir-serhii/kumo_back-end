import { FastifyPluginAsync } from 'fastify';
import { google } from 'googleapis';
import { z } from 'zod';
import { httpError } from '../utils/errors';
import { formatUserResponse } from '../utils/helpers';
import { env } from '../config/env';

const verifyPurchaseSchema = z.object({
  purchaseToken: z.string().min(1, 'Purchase token is required'),
  productId: z.string().min(1, 'Product ID is required'),
});

const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  // POST /subscription/verify - Verify Google Play purchase
  fastify.post('/verify', async (request, reply) => {
    const parsed = verifyPurchaseSchema.safeParse(request.body);
    if (!parsed.success) {
      httpError(parsed.error.errors[0].message, 400);
    }

    const { purchaseToken, productId } = parsed.data;
    const userId = request.user.userId;

    // Verify purchase with Google Play API
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY),
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const androidPublisher = google.androidpublisher({ version: 'v3', auth });

    const subscription = await androidPublisher.purchases.subscriptions.get({
      packageName: env.ANDROID_PACKAGE_NAME,
      subscriptionId: productId,
      token: purchaseToken,
    });

    // Check if purchase is valid (paymentState: 1 = Payment received)
    if (!subscription.data || subscription.data.paymentState !== 1) {
      httpError('Invalid or unpaid subscription', 400);
    }

    // Determine subscription expiry date
    const expiryTimeMillis = parseInt(subscription.data.expiryTimeMillis || '0');
    const expiryDate = new Date(expiryTimeMillis);

    // Update user subscription
    const user = await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        subscription: 'pro',
        nextPaymentDate: expiryDate,
      },
      include: {
        weeklyStreaks: {
          orderBy: { date: 'desc' },
          take: 7,
        },
      },
    });

    return reply.send({
      success: true,
      message: 'Subscription activated successfully',
      user: formatUserResponse(user, user.weeklyStreaks),
    });
  });
};

export default subscriptionRoutes;
