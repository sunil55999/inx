/**
 * Email Template Service Tests
 * 
 * Tests email template generation for various notification types
 */

import { EmailTemplateService } from '../EmailTemplateService';
import { NotificationEvent } from '../NotificationService';

describe('EmailTemplateService', () => {
  let emailTemplateService: EmailTemplateService;

  beforeEach(() => {
    emailTemplateService = new EmailTemplateService();
  });

  describe('Order Payment Detected Template', () => {
    it('should generate template with order details', () => {
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.ORDER_PAYMENT_DETECTED,
        'Payment Detected',
        'We have detected your payment',
        {
          orderId: 'order_123',
          amount: 50,
          currency: 'USDT',
        }
      );

      expect(template.subject).toContain('Payment Detected');
      expect(template.subject).toContain('50 USDT');
      expect(template.htmlBody).toContain('order_123');
      expect(template.htmlBody).toContain('50');
      expect(template.htmlBody).toContain('USDT');
      expect(template.textBody).toContain('order_123');
    });
  });

  describe('Order Payment Confirmed Template', () => {
    it('should generate template with channel name', () => {
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.ORDER_PAYMENT_CONFIRMED,
        'Payment Confirmed',
        'Your payment has been confirmed',
        {
          orderId: 'order_456',
          channelName: 'Crypto Signals Pro',
        }
      );

      expect(template.subject).toContain('Payment Confirmed');
      expect(template.subject).toContain('Crypto Signals Pro');
      expect(template.htmlBody).toContain('Crypto Signals Pro');
      expect(template.textBody).toContain('Crypto Signals Pro');
    });
  });

  describe('Subscription Activated Template', () => {
    it('should generate template with expiry date', () => {
      const expiryDate = new Date('2024-12-31');
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.SUBSCRIPTION_ACTIVATED,
        'Subscription Activated',
        'Your subscription is now active',
        {
          subscriptionId: 'sub_789',
          channelName: 'Trading Signals',
          expiryDate: expiryDate.toISOString(),
        }
      );

      expect(template.subject).toContain('Subscription Activated');
      expect(template.subject).toContain('Trading Signals');
      expect(template.htmlBody).toContain('Trading Signals');
      expect(template.htmlBody).toContain('12/31/2024');
      expect(template.textBody).toContain('sub_789');
    });
  });

  describe('Subscription Expiring Soon Template', () => {
    it('should generate template with renewal link', () => {
      const expiryDate = new Date('2024-06-15');
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.SUBSCRIPTION_EXPIRING_SOON,
        'Subscription Expiring Soon',
        'Your subscription expires soon',
        {
          subscriptionId: 'sub_abc',
          channelName: 'Premium Signals',
          expiryDate: expiryDate.toISOString(),
        }
      );

      expect(template.subject).toContain('Expiring Soon');
      expect(template.htmlBody).toContain('Premium Signals');
      expect(template.htmlBody).toContain('Renew Now');
      expect(template.htmlBody).toContain('/subscriptions/sub_abc/renew');
    });
  });

  describe('Subscription Expired Template', () => {
    it('should generate template with browse listings link', () => {
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.SUBSCRIPTION_EXPIRED,
        'Subscription Expired',
        'Your subscription has expired',
        {
          subscriptionId: 'sub_def',
          channelName: 'VIP Signals',
        }
      );

      expect(template.subject).toContain('Subscription Expired');
      expect(template.htmlBody).toContain('VIP Signals');
      expect(template.htmlBody).toContain('Browse Listings');
      expect(template.htmlBody).toContain('/listings');
    });
  });

  describe('Dispute Created Template', () => {
    it('should generate template with dispute details', () => {
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.DISPUTE_CREATED,
        'New Dispute',
        'A dispute has been created',
        {
          disputeId: 'dispute_123',
          orderId: 'order_789',
        }
      );

      expect(template.subject).toContain('Dispute Created');
      expect(template.htmlBody).toContain('dispute_123');
      expect(template.htmlBody).toContain('order_789');
      expect(template.htmlBody).toContain('24-48 hours');
    });
  });

  describe('Dispute Resolved Template', () => {
    it('should generate template for approved refund', () => {
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.DISPUTE_RESOLVED,
        'Dispute Resolved',
        'Your dispute has been resolved',
        {
          disputeId: 'dispute_456',
          refundApproved: true,
        }
      );

      expect(template.subject).toContain('Refund Approved');
      expect(template.htmlBody).toContain('resolved in your favor');
      expect(template.htmlBody).toContain('refund has been processed');
    });

    it('should generate template for denied refund', () => {
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.DISPUTE_RESOLVED,
        'Dispute Resolved',
        'Your dispute has been resolved',
        {
          disputeId: 'dispute_789',
          refundApproved: false,
        }
      );

      expect(template.subject).toContain('Refund Denied');
      expect(template.htmlBody).toContain('refund request was denied');
    });
  });

  describe('Payout Completed Template', () => {
    it('should generate template with transaction hash', () => {
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.PAYOUT_COMPLETED,
        'Payout Completed',
        'Your payout has been processed',
        {
          payoutId: 'payout_123',
          amount: 500,
          currency: 'USDT',
          transactionHash: '0x1234567890abcdef',
        }
      );

      expect(template.subject).toContain('Payout Completed');
      expect(template.subject).toContain('500 USDT');
      expect(template.htmlBody).toContain('500');
      expect(template.htmlBody).toContain('USDT');
      expect(template.htmlBody).toContain('0x1234567890abcdef');
    });
  });

  describe('Payout Failed Template', () => {
    it('should generate template with error message', () => {
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.PAYOUT_FAILED,
        'Payout Failed',
        'Your payout has failed',
        {
          payoutId: 'payout_456',
          amount: 250,
          currency: 'BNB',
          error: 'Insufficient gas',
        }
      );

      expect(template.subject).toContain('Payout Failed');
      expect(template.htmlBody).toContain('250');
      expect(template.htmlBody).toContain('BNB');
      expect(template.htmlBody).toContain('Insufficient gas');
      expect(template.htmlBody).toContain('balance has been restored');
    });
  });

  describe('Listing Deactivated Template', () => {
    it('should generate template with reason', () => {
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.LISTING_DEACTIVATED,
        'Listing Deactivated',
        'Your listing has been deactivated',
        {
          listingId: 'listing_123',
          channelName: 'My Channel',
          reason: 'Bot lost admin permissions',
        }
      );

      expect(template.subject).toContain('Listing Deactivated');
      expect(template.htmlBody).toContain('My Channel');
      expect(template.htmlBody).toContain('Bot lost admin permissions');
      expect(template.htmlBody).toContain('admin permissions');
    });
  });

  describe('HTML Layout', () => {
    it('should wrap content in proper HTML structure', () => {
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.ORDER_PAYMENT_CONFIRMED,
        'Test Title',
        'Test Message',
        {}
      );

      expect(template.htmlBody).toContain('<!DOCTYPE html>');
      expect(template.htmlBody).toContain('<html lang="en">');
      expect(template.htmlBody).toContain('Telegram Signals Marketplace');
      expect(template.htmlBody).toContain('© ' + new Date().getFullYear());
      expect(template.htmlBody).toContain('</html>');
    });

    it('should include support email in footer', () => {
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.ORDER_PAYMENT_CONFIRMED,
        'Test Title',
        'Test Message',
        {}
      );

      expect(template.htmlBody).toContain('support@');
      expect(template.htmlBody).toContain('Need help?');
    });
  });

  describe('Text Body', () => {
    it('should generate plain text version', () => {
      const template = emailTemplateService.generateTemplate(
        NotificationEvent.ORDER_PAYMENT_CONFIRMED,
        'Payment Confirmed',
        'Your payment has been confirmed',
        {
          orderId: 'order_123',
          channelName: 'Test Channel',
        }
      );

      expect(template.textBody).toContain('Payment Confirmed');
      expect(template.textBody).toContain('Your payment has been confirmed');
      expect(template.textBody).toContain('order_123');
      expect(template.textBody).toContain('Test Channel');
      expect(template.textBody).not.toContain('<');
      expect(template.textBody).not.toContain('>');
    });
  });

  describe('Default Template', () => {
    it('should handle unknown event types', () => {
      const template = emailTemplateService.generateTemplate(
        'UNKNOWN_EVENT' as NotificationEvent,
        'Unknown Event',
        'This is an unknown event',
        {}
      );

      expect(template.subject).toBe('Unknown Event');
      expect(template.htmlBody).toContain('Unknown Event');
      expect(template.htmlBody).toContain('This is an unknown event');
      expect(template.textBody).toContain('Unknown Event');
    });
  });
});
