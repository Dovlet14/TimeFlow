/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Category = 'study' | 'sport' | 'rest' | 'work' | 'other';

export interface TaskNotificationSettings {
  enabled: boolean;
  onStart: boolean;
  onEnd: boolean;
  reminderMinutes: number; // 0, 5, 10, 15
  soundEnabled: boolean;
  soundName: string; // 'default', 'calm', 'tech', 'custom'
  customSoundUrl?: string;
  vibrate: boolean;
  volume: number; // 0 to 1
}

export interface ScheduleTask {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD format
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  category: Category;
  isCompleted: boolean;
  isRecurring?: boolean;
  recurringDays?: number[]; // 0-6 (Sunday-Saturday)
  description?: string;
  createdAt: number;
  notifications?: TaskNotificationSettings;
}

export interface GlobalSettings {
  allNotificationsEnabled: boolean;
  globalVolume: number;
  defaultSound: string;
}
