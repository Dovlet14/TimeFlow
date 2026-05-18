import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { ScheduleTask } from '../types';

function stringToId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getDuration(start: string, end: string) {
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff < 0) diff += 24 * 60;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours > 0 && mins > 0) return `${hours} ч. ${mins} мин.`;
  if (hours > 0) return `${hours} ч.`;
  return `${mins} мин.`;
}

export const requestNotificationPermission = async () => {
  const isWeb = Capacitor.getPlatform() === 'web';
  
  const status = await LocalNotifications.checkPermissions();
  if (status.display !== 'granted') {
    await LocalNotifications.requestPermissions();
  }
  
  // Create a high-priority channel for Android
  if (Capacitor.getPlatform() === 'android') {
    try {
      await LocalNotifications.createChannel({
        id: 'task-reminders',
        name: 'Task Reminders',
        description: 'Notifications for task starts, ends and reminders',
        importance: 5, // High importance
        visibility: 1, // Public (show on lock screen)
        sound: 'default',
        vibration: true,
      });
    } catch (e) {
      console.error('Error creating notification channel', e);
    }
  }
};

export const scheduleTaskNotifications = async (tasks: ScheduleTask[]) => {
  // Ensure permission and channel exist
  await requestNotificationPermission();

  // First cancel all existing notifications
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }
  } catch (e) {
    console.error('Error cancelling notifications', e);
  }

  const notificationsToSchedule: any[] = [];
  const now = new Date();

  tasks.forEach(task => {
    if (!task.notifications?.enabled) return;

    const [startH, startM] = task.startTime.split(':').map(Number);
    const [endH, endM] = task.endTime.split(':').map(Number);
    const durationStr = getDuration(task.startTime, task.endTime);

    const scheduleNotification = (idSuffix: string, h: number, m: number, title: string, body: string) => {
      const id = stringToId(task.id + idSuffix);
      
      const notificationBase = {
        title,
        body,
        channelId: 'task-reminders',
        schedule: {
          allowWhileIdle: true
        }
      };

      if (task.isRecurring && task.recurringDays && task.recurringDays.length > 0) {
        // Schedule for each recurring day
        task.recurringDays.forEach(day => {
          // Adjust 0=Sunday to Capacitor's day of week (1=Sunday, 2=Monday, ..., 7=Saturday)
          const capDay = day + 1;
          
          notificationsToSchedule.push({
            ...notificationBase,
            id: id + day * 1000000, // Make ID unique for each day
            schedule: {
              ...notificationBase.schedule,
              on: {
                weekday: capDay,
                hour: h,
                minute: m
              }
            }
          });
        });
      } else {
        // One-time notification
        const [year, month, day] = task.date.split('-').map(Number);
        const scheduledTime = new Date(year, month - 1, day, h, m, 0);

        if (scheduledTime > now) {
          notificationsToSchedule.push({
            ...notificationBase,
            id,
            schedule: { 
              ...notificationBase.schedule,
              at: scheduledTime 
            }
          });
        }
      }
    };

    if (task.notifications.onStart) {
      scheduleNotification('_start', startH, startM, `Начало: ${task.title}`, `Задание началось. Длительность: ${durationStr}`);
    }

    if (task.notifications.onEnd) {
      scheduleNotification('_end', endH, endM, `Завершение: ${task.title}`, `Задание окончено. Длительность выполнения: ${durationStr}`);
    }

    if (task.notifications.reminderMinutes > 0) {
      let remM = startM - task.notifications.reminderMinutes;
      let remH = startH;
      if (remM < 0) {
        remM += 60;
        remH -= 1;
      }
      if (remH >= 0) {
        scheduleNotification('_rem', remH, remM, `Напоминание: ${task.title}`, `Начнется через ${task.notifications.reminderMinutes} мин. Длительность: ${durationStr}`);
      }
    }
  });

  if (notificationsToSchedule.length > 0) {
    try {
      // Capacitor has a limit of 500 notifications. We should probably chunk or limit.
      const chunks = [];
      for (let i = 0; i < notificationsToSchedule.length; i += 50) {
        chunks.push(notificationsToSchedule.slice(i, i + 50));
      }
      for (const chunk of chunks) {
        await LocalNotifications.schedule({ notifications: chunk });
      }
    } catch (e) {
      console.error('Error scheduling notifications', e);
    }
  }
};
