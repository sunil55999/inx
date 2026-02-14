import apiClient from '../config/api';
import { Notification } from '../types';

export const notificationService = {
  // Get notifications
  async getNotifications(): Promise<Notification[]> {
    const response = await apiClient.get('/api/notifications');
    return response.data;
  },

  // Get unread count
  async getUnreadCount(): Promise<{ count: number }> {
    const response = await apiClient.get('/api/notifications/unread-count');
    return response.data;
  },

  // Mark notification as read
  async markAsRead(id: string): Promise<void> {
    await apiClient.patch(`/api/notifications/${id}/read`);
  },

  // Mark all as read
  async markAllAsRead(): Promise<void> {
    await apiClient.post('/api/notifications/mark-all-read');
  },

  // Delete notification
  async deleteNotification(id: string): Promise<void> {
    await apiClient.delete(`/api/notifications/${id}`);
  },
};
