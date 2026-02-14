/**
 * Email Template Service
 * 
 * Generates HTML email templates for different notification types
 * 
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
 */

import { NotificationEvent } from './NotificationService';
import { EMAIL_SUPPORT } from '../config/ses';

/**
 * Email template data
 */
export interface EmailTemplateData {
  subject: string;
  htmlBody: string;
  textBody: string;
}

/**
 * Email Template Service
 * 
 * Generates email templates for various notification types
 */
export class EmailTemplateService {
  private readonly frontendUrl: string;
  private readonly supportEmail: string;

  constructor() {
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    this.supportEmail = EMAIL_SUPPORT;
  }

  /**
   * Generate email template for a notification event
   * 
   * @param event - Notification event type
   * @param title - Notification title
   * @param message - Notification message
   * @param metadata - Additional metadata
   * @returns Email template data
   */
  generateTemplate(
    event: NotificationEvent,
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    switch (event) {
      case NotificationEvent.ORDER_PAYMENT_DETECTED:
        return this.orderPaymentDetectedTemplate(title, message, metadata);
      
      case NotificationEvent.ORDER_PAYMENT_CONFIRMED:
        return this.orderPaymentConfirmedTemplate(title, message, metadata);
      
      case NotificationEvent.SUBSCRIPTION_ACTIVATED:
        return this.subscriptionActivatedTemplate(title, message, metadata);
      
      case NotificationEvent.SUBSCRIPTION_EXPIRING_SOON:
        return this.subscriptionExpiringSoonTemplate(title, message, metadata);
      
      case NotificationEvent.SUBSCRIPTION_EXPIRED:
        return this.subscriptionExpiredTemplate(title, message, metadata);
      
      case NotificationEvent.SUBSCRIPTION_RENEWED:
        return this.subscriptionRenewedTemplate(title, message, metadata);
      
      case NotificationEvent.DISPUTE_CREATED:
        return this.disputeCreatedTemplate(title, message, metadata);
      
      case NotificationEvent.DISPUTE_RESOLVED:
        return this.disputeResolvedTemplate(title, message, metadata);
      
      case NotificationEvent.REFUND_PROCESSED:
        return this.refundProcessedTemplate(title, message, metadata);
      
      case NotificationEvent.PAYOUT_COMPLETED:
        return this.payoutCompletedTemplate(title, message, metadata);
      
      case NotificationEvent.PAYOUT_FAILED:
        return this.payoutFailedTemplate(title, message, metadata);
      
      case NotificationEvent.LISTING_DEACTIVATED:
        return this.listingDeactivatedTemplate(title, message, metadata);
      
      case NotificationEvent.MERCHANT_SUSPENDED:
        return this.merchantSuspendedTemplate(title, message, metadata);
      
      case NotificationEvent.MERCHANT_VERIFIED:
        return this.merchantVerifiedTemplate(title, message, metadata);
      
      default:
        return this.defaultTemplate(title, message, metadata);
    }
  }

  /**
   * Order payment detected template
   */
  private orderPaymentDetectedTemplate(
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    const orderId = metadata?.orderId || '';
    const amount = metadata?.amount || '';
    const currency = metadata?.currency || '';

    const subject = `Payment Detected - ${amount} ${currency}`;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #4CAF50;">💰 ${title}</h2>
      <p>${message}</p>
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Order ID:</strong> ${orderId}</p>
        <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount} ${currency}</p>
      </div>
      <p>We're waiting for blockchain confirmations. You'll receive another email once your payment is fully confirmed.</p>
      <a href="${this.frontendUrl}/orders/${orderId}" style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px;">View Order</a>
    `);

    const textBody = `${title}\n\n${message}\n\nOrder ID: ${orderId}\nAmount: ${amount} ${currency}\n\nView your order: ${this.frontendUrl}/orders/${orderId}`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Order payment confirmed template
   */
  private orderPaymentConfirmedTemplate(
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    const orderId = metadata?.orderId || '';
    const channelName = metadata?.channelName || '';

    const subject = `Payment Confirmed - Access to ${channelName}`;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #4CAF50;">✅ ${title}</h2>
      <p>${message}</p>
      <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4CAF50;">
        <p style="margin: 5px 0;"><strong>Channel:</strong> ${channelName}</p>
        <p style="margin: 5px 0;">You'll be added to the channel shortly via our Telegram bot.</p>
      </div>
      <a href="${this.frontendUrl}/subscriptions" style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px;">View Subscriptions</a>
    `);

    const textBody = `${title}\n\n${message}\n\nOrder ID: ${orderId}\nChannel: ${channelName}\n\nView your subscriptions: ${this.frontendUrl}/subscriptions`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Subscription activated template
   */
  private subscriptionActivatedTemplate(
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    const subscriptionId = metadata?.subscriptionId || '';
    const channelName = metadata?.channelName || '';
    const expiryDate = metadata?.expiryDate ? new Date(metadata.expiryDate).toLocaleDateString() : '';

    const subject = `Subscription Activated - ${channelName}`;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #2196F3;">🎉 ${title}</h2>
      <p>${message}</p>
      <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2196F3;">
        <p style="margin: 5px 0;"><strong>Channel:</strong> ${channelName}</p>
        <p style="margin: 5px 0;"><strong>Expires:</strong> ${expiryDate}</p>
      </div>
      <p>Enjoy your access to premium signals!</p>
      <a href="${this.frontendUrl}/subscriptions/${subscriptionId}" style="display: inline-block; background-color: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px;">View Subscription</a>
    `);

    const textBody = `${title}\n\n${message}\n\nChannel: ${channelName}\nExpires: ${expiryDate}\n\nView subscription: ${this.frontendUrl}/subscriptions/${subscriptionId}`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Subscription expiring soon template
   */
  private subscriptionExpiringSoonTemplate(
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    const subscriptionId = metadata?.subscriptionId || '';
    const channelName = metadata?.channelName || '';
    const expiryDate = metadata?.expiryDate ? new Date(metadata.expiryDate).toLocaleDateString() : '';

    const subject = `⏰ Subscription Expiring Soon - ${channelName}`;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #FF9800;">⏰ ${title}</h2>
      <p>${message}</p>
      <div style="background-color: #fff3e0; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #FF9800;">
        <p style="margin: 5px 0;"><strong>Channel:</strong> ${channelName}</p>
        <p style="margin: 5px 0;"><strong>Expires:</strong> ${expiryDate}</p>
      </div>
      <p>Don't lose access to your premium signals!</p>
      <a href="${this.frontendUrl}/subscriptions/${subscriptionId}/renew" style="display: inline-block; background-color: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px;">Renew Now</a>
    `);

    const textBody = `${title}\n\n${message}\n\nChannel: ${channelName}\nExpires: ${expiryDate}\n\nRenew now: ${this.frontendUrl}/subscriptions/${subscriptionId}/renew`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Subscription expired template
   */
  private subscriptionExpiredTemplate(
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    const channelName = metadata?.channelName || '';

    const subject = `Subscription Expired - ${channelName}`;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #f44336;">⏱️ ${title}</h2>
      <p>${message}</p>
      <div style="background-color: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f44336;">
        <p style="margin: 5px 0;"><strong>Channel:</strong> ${channelName}</p>
      </div>
      <p>Want to regain access? Purchase a new subscription anytime.</p>
      <a href="${this.frontendUrl}/listings" style="display: inline-block; background-color: #f44336; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px;">Browse Listings</a>
    `);

    const textBody = `${title}\n\n${message}\n\nChannel: ${channelName}\n\nBrowse listings: ${this.frontendUrl}/listings`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Subscription renewed template
   */
  private subscriptionRenewedTemplate(
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    const subscriptionId = metadata?.subscriptionId || '';
    const channelName = metadata?.channelName || '';
    const newExpiryDate = metadata?.newExpiryDate ? new Date(metadata.newExpiryDate).toLocaleDateString() : '';

    const subject = `Subscription Renewed - ${channelName}`;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #4CAF50;">🔄 ${title}</h2>
      <p>${message}</p>
      <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4CAF50;">
        <p style="margin: 5px 0;"><strong>Channel:</strong> ${channelName}</p>
        <p style="margin: 5px 0;"><strong>New Expiry Date:</strong> ${newExpiryDate}</p>
      </div>
      <a href="${this.frontendUrl}/subscriptions/${subscriptionId}" style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px;">View Subscription</a>
    `);

    const textBody = `${title}\n\n${message}\n\nChannel: ${channelName}\nNew Expiry Date: ${newExpiryDate}\n\nView subscription: ${this.frontendUrl}/subscriptions/${subscriptionId}`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Dispute created template
   */
  private disputeCreatedTemplate(
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    const disputeId = metadata?.disputeId || '';
    const orderId = metadata?.orderId || '';

    const subject = `Dispute Created - Order ${orderId}`;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #FF9800;">⚠️ ${title}</h2>
      <p>${message}</p>
      <div style="background-color: #fff3e0; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #FF9800;">
        <p style="margin: 5px 0;"><strong>Dispute ID:</strong> ${disputeId}</p>
        <p style="margin: 5px 0;"><strong>Order ID:</strong> ${orderId}</p>
      </div>
      <p>Our team will review this dispute and respond within 24-48 hours.</p>
      <a href="${this.frontendUrl}/disputes/${disputeId}" style="display: inline-block; background-color: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px;">View Dispute</a>
    `);

    const textBody = `${title}\n\n${message}\n\nDispute ID: ${disputeId}\nOrder ID: ${orderId}\n\nView dispute: ${this.frontendUrl}/disputes/${disputeId}`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Dispute resolved template
   */
  private disputeResolvedTemplate(
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    const disputeId = metadata?.disputeId || '';
    const refundApproved = metadata?.refundApproved || false;

    const subject = refundApproved 
      ? `Dispute Resolved - Refund Approved`
      : `Dispute Resolved - Refund Denied`;
    
    const color = refundApproved ? '#4CAF50' : '#f44336';
    const bgColor = refundApproved ? '#e8f5e9' : '#ffebee';
    
    const statusMessage = refundApproved
      ? 'Your dispute has been resolved in your favor, and the refund has been processed.'
      : 'Your dispute has been reviewed, but the refund request was denied.';
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: ${color};">✓ ${title}</h2>
      <p>${message}</p>
      <div style="background-color: ${bgColor}; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid ${color};">
        <p style="margin: 5px 0;"><strong>Dispute ID:</strong> ${disputeId}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> ${refundApproved ? 'Refund Approved' : 'Refund Denied'}</p>
      </div>
      <p>${statusMessage}</p>
      <p>If you have any questions, please contact our support team.</p>
      <a href="${this.frontendUrl}/disputes/${disputeId}" style="display: inline-block; background-color: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px;">View Dispute</a>
    `);

    const textBody = `${title}\n\n${message}\n\nDispute ID: ${disputeId}\nStatus: ${refundApproved ? 'Refund Approved' : 'Refund Denied'}\n\n${statusMessage}\n\nView dispute: ${this.frontendUrl}/disputes/${disputeId}`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Refund processed template
   */
  private refundProcessedTemplate(
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    const amount = metadata?.amount || '';
    const currency = metadata?.currency || '';
    const transactionHash = metadata?.transactionHash || '';

    const subject = `Refund Processed - ${amount} ${currency}`;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #4CAF50;">💸 ${title}</h2>
      <p>${message}</p>
      <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4CAF50;">
        <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount} ${currency}</p>
        ${transactionHash ? `<p style="margin: 5px 0;"><strong>Transaction Hash:</strong> <code style="font-size: 12px;">${transactionHash}</code></p>` : ''}
      </div>
      <p>The refund has been sent to your original payment address.</p>
    `);

    const textBody = `${title}\n\n${message}\n\nAmount: ${amount} ${currency}${transactionHash ? `\nTransaction Hash: ${transactionHash}` : ''}`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Payout completed template
   */
  private payoutCompletedTemplate(
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    const amount = metadata?.amount || '';
    const currency = metadata?.currency || '';
    const transactionHash = metadata?.transactionHash || '';

    const subject = `Payout Completed - ${amount} ${currency}`;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #4CAF50;">💰 ${title}</h2>
      <p>${message}</p>
      <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4CAF50;">
        <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount} ${currency}</p>
        <p style="margin: 5px 0;"><strong>Transaction Hash:</strong> <code style="font-size: 12px;">${transactionHash}</code></p>
      </div>
      <p>Your funds have been sent to your wallet address.</p>
      <a href="${this.frontendUrl}/merchant/payouts" style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px;">View Payouts</a>
    `);

    const textBody = `${title}\n\n${message}\n\nAmount: ${amount} ${currency}\nTransaction Hash: ${transactionHash}\n\nView payouts: ${this.frontendUrl}/merchant/payouts`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Payout failed template
   */
  private payoutFailedTemplate(
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    const amount = metadata?.amount || '';
    const currency = metadata?.currency || '';
    const error = metadata?.error || 'Unknown error';

    const subject = `Payout Failed - ${amount} ${currency}`;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #f44336;">❌ ${title}</h2>
      <p>${message}</p>
      <div style="background-color: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f44336;">
        <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount} ${currency}</p>
        <p style="margin: 5px 0;"><strong>Error:</strong> ${error}</p>
      </div>
      <p>Your balance has been restored. Please try again or contact support if the issue persists.</p>
      <a href="${this.frontendUrl}/merchant/payouts" style="display: inline-block; background-color: #f44336; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px;">View Payouts</a>
    `);

    const textBody = `${title}\n\n${message}\n\nAmount: ${amount} ${currency}\nError: ${error}\n\nView payouts: ${this.frontendUrl}/merchant/payouts`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Listing deactivated template
   */
  private listingDeactivatedTemplate(
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    const channelName = metadata?.channelName || '';
    const reason = metadata?.reason || 'Bot lost admin permissions';

    const subject = `Listing Deactivated - ${channelName}`;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #FF9800;">⚠️ ${title}</h2>
      <p>${message}</p>
      <div style="background-color: #fff3e0; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #FF9800;">
        <p style="margin: 5px 0;"><strong>Channel:</strong> ${channelName}</p>
        <p style="margin: 5px 0;"><strong>Reason:</strong> ${reason}</p>
      </div>
      <p>Please ensure our bot has admin permissions in your channel, then reactivate your listing.</p>
      <a href="${this.frontendUrl}/merchant/listings" style="display: inline-block; background-color: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px;">Manage Listings</a>
    `);

    const textBody = `${title}\n\n${message}\n\nChannel: ${channelName}\nReason: ${reason}\n\nManage listings: ${this.frontendUrl}/merchant/listings`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Merchant suspended template
   */
  private merchantSuspendedTemplate(
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): EmailTemplateData {
    const reason = metadata?.reason || 'Terms of service violation';

    const subject = `Account Suspended`;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #f44336;">🚫 ${title}</h2>
      <p>${message}</p>
      <div style="background-color: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f44336;">
        <p style="margin: 5px 0;"><strong>Reason:</strong> ${reason}</p>
      </div>
      <p>If you believe this is a mistake, please contact our support team.</p>
      <p><a href="mailto:${this.supportEmail}">${this.supportEmail}</a></p>
    `);

    const textBody = `${title}\n\n${message}\n\nReason: ${reason}\n\nContact support: ${this.supportEmail}`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Merchant verified template
   */
  private merchantVerifiedTemplate(
    title: string,
    message: string,
    _metadata?: Record<string, any>
  ): EmailTemplateData {
    const subject = `Account Verified`;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #4CAF50;">✓ ${title}</h2>
      <p>${message}</p>
      <div style="background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4CAF50;">
        <p style="margin: 5px 0;">Your merchant account has been verified and you can now create listings.</p>
      </div>
      <a href="${this.frontendUrl}/merchant/listings/new" style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 15px;">Create Listing</a>
    `);

    const textBody = `${title}\n\n${message}\n\nCreate a listing: ${this.frontendUrl}/merchant/listings/new`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Default template for unknown event types
   */
  private defaultTemplate(
    title: string,
    message: string,
    _metadata?: Record<string, any>
  ): EmailTemplateData {
    const subject = title;
    
    const htmlBody = this.wrapInLayout(`
      <h2 style="color: #2196F3;">📬 ${title}</h2>
      <p>${message}</p>
    `);

    const textBody = `${title}\n\n${message}`;

    return { subject, htmlBody, textBody };
  }

  /**
   * Wrap content in email layout
   * 
   * @param content - HTML content
   * @returns Complete HTML email
   */
  private wrapInLayout(content: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Telegram Signals Marketplace</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #1976D2; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Telegram Signals Marketplace</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f5f5f5; padding: 20px 30px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="color: #666; font-size: 12px; margin: 5px 0;">
                © ${new Date().getFullYear()} Telegram Signals Marketplace. All rights reserved.
              </p>
              <p style="color: #666; font-size: 12px; margin: 5px 0;">
                Need help? Contact us at <a href="mailto:${this.supportEmail}" style="color: #1976D2;">${this.supportEmail}</a>
              </p>
              <p style="color: #999; font-size: 11px; margin: 15px 0 5px 0;">
                This is an automated email. Please do not reply to this message.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }
}

// Export singleton instance
export const emailTemplateService = new EmailTemplateService();
