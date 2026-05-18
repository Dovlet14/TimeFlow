/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Clock, Trash2, Edit2, CheckCircle, Circle, 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, 
  Search, Filter, Sun, Moon, PieChart, Sparkles, X, RotateCcw,
  Zap, Play, Pause, Square, ExternalLink, GripVertical,
  ClipboardCheck, CalendarDays, BarChart3, Settings as SettingsIcon,
  Bell, Info, Shield, HelpCircle
} from 'lucide-react';
import { ScheduleTask, Category, GlobalSettings, TaskNotificationSettings } from './types';
import { CATEGORIES, STORAGE_KEY, QUICK_TEMPLATES } from './constants';
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts';
import { GoogleGenAI } from "@google/genai";
import confetti from 'canvas-confetti';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { requestNotificationPermission, scheduleTaskNotifications } from './lib/notifications';

const getGenAI = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key === 'undefined' || key === '') {
    return null;
  }
  try {
    return new GoogleGenAI({ apiKey: key });
  } catch (e) {
    console.error("GoogleGenAI init failed:", e);
    return null;
  }
};

const genAI = getGenAI();

const getLocalDateString = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseISOToDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const getDuration = (start: string, end: string) => {
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (diff < 0) diff += 24 * 60;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours > 0 && mins > 0) return `${hours} ч. ${mins} мин.`;
  if (hours > 0) return `${hours} ч.`;
  return `${mins} мин.`;
};

interface UINotification {
  id: string;
  title: string;
  body: string;
  type: 'start' | 'end' | 'reminder';
  timestamp: number;
}

export default function App() {
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [activeNotification, setActiveNotification] = useState<UINotification | null>(null);
  const [completedRecurringTasks, setCompletedRecurringTasks] = useState<Record<string, string[]>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPomodoroOpen, setIsPomodoroOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduleTask | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => getLocalDateString());
  const [darkMode, setDarkMode] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    allNotificationsEnabled: true,
    globalVolume: 0.7,
    defaultSound: 'default'
  });
  
  // Track notified tasks to avoid duplicates
  const notifiedIds = React.useRef<Set<string>>(new Set());
  const [pomodoroTime, setPomodoroTime] = useState(25 * 60);
  const [isPomodoroRunning, setIsPomodoroRunning] = useState(false);
  const [pomodoroMode, setPomodoroMode] = useState<'work' | 'break'>('work');
  
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<Category | 'all'>('all');
  
  // AI State
  const [aiQuote, setAiQuote] = useState<string>('');
  const [isGeneratingQuote, setIsGeneratingQuote] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeTab, setActiveTab] = useState<'today' | 'calendar' | 'stats' | 'settings'>('today');

  // Online Status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  const [viewMonth, setViewMonth] = useState(new Date());

  // Calendar Logic
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    // Adjust for Monday start (0=Sunday -> 0=Monday)
    const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
    
    const days = [];
    
    // Padding for previous month
    for (let i = 0; i < adjustedFirstDay; i++) {
      days.push({ day: null, fullDate: null });
    }
    
    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const fullDate = getLocalDateString(date);
      days.push({ day: i, fullDate });
    }
    
    return days;
  }, [viewMonth]);

  const changeMonth = (offset: number) => {
    const newDate = new Date(viewMonth);
    newDate.setMonth(newDate.getMonth() + offset);
    setViewMonth(newDate);
  };

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    startTime: '09:00',
    endTime: '10:00',
    category: 'study' as Category,
    description: '',
    isRecurring: false,
    recurringDays: [0, 1, 2, 3, 4, 5, 6], // Default all days
    date: getLocalDateString(),
    notifications: {
      enabled: true,
      onStart: true,
      onEnd: true,
      reminderMinutes: 5,
      soundEnabled: true,
      soundName: 'default',
      vibrate: true,
      volume: 1
    } as TaskNotificationSettings
  });

  // Load from localStorage
  // Theme Logic
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const savedTasks = localStorage.getItem(STORAGE_KEY);
    const savedRecurringCompletions = localStorage.getItem(STORAGE_KEY + '_recurring');
    const savedSettings = localStorage.getItem(STORAGE_KEY + '_settings');
    
    if (savedTheme === 'dark') {
      setDarkMode(true);
    }
    
    if (savedSettings) {
      try {
        setGlobalSettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
    
    if (savedTasks) {
      try {
        const parsed: ScheduleTask[] = JSON.parse(savedTasks);
        // Migration: Add current date to tasks that don't have it
        const today = getLocalDateString();
        const migrated = parsed.map(t => ({
          ...t,
          date: t.date || today,
          createdAt: t.createdAt || Date.now(),
          notifications: t.notifications || {
            enabled: true,
            onStart: true,
            onEnd: true,
            reminderMinutes: 5,
            soundEnabled: true,
            soundName: 'default',
            vibrate: true,
            volume: 1
          }
        }));
        setTasks(migrated);
      } catch (e) {
        console.error("Failed to parse tasks", e);
      }
    }

    if (savedRecurringCompletions) {
      try {
        setCompletedRecurringTasks(JSON.parse(savedRecurringCompletions));
      } catch (e) {
        console.error("Failed to parse recurring completions", e);
      }
    }

    // Request Notification permission (Browser + Capacitor)
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    // Schedule Capacitor notifications whenever tasks change (debounced)
    const timer = setTimeout(() => {
      scheduleTaskNotifications(tasks);
    }, 2000);
    return () => clearTimeout(timer);
  }, [tasks]);

  useEffect(() => {
    if (activeNotification) {
      const timer = setTimeout(() => {
        setActiveNotification(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [activeNotification]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY + '_recurring', JSON.stringify(completedRecurringTasks));
  }, [completedRecurringTasks]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY + '_settings', JSON.stringify(globalSettings));
  }, [globalSettings]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Pomodoro Logic
  const playNotificationSound = (soundName: string = 'default', volume: number = 1) => {
    if (!globalSettings.allNotificationsEnabled) return;
    
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      const finalVolume = volume * globalSettings.globalVolume;
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(finalVolume, audioCtx.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.2);

      if (soundName === 'calm') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(660, audioCtx.currentTime + 0.6);
      } else if (soundName === 'tech') {
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        oscillator.frequency.setValueAtTime(1760, audioCtx.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + 0.2);
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
      } else {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5);
      }

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 1.2);

      // Vibrate if supported
      if ("vibrate" in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
    } catch (e) {
      console.error("Audio API error:", e);
    }
  };

  // Notification Engine
  useEffect(() => {
    const checkNotifications = () => {
      if (!globalSettings.allNotificationsEnabled) return;

      const now = new Date();
      const currentFullDate = getLocalDateString(now);
      const currentTimeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
      
      tasks.forEach(task => {
        if (!isTaskVisibleOnDate(task, currentFullDate) || !task.notifications?.enabled) return;

        const { startTime, endTime, id, notifications } = task;
        
        // Helper to check if it's time for a reminder
        const checkReminder = (time: string, offsetMin: number, label: string) => {
          const [h, m] = time.split(':').map(Number);
          const eventDate = new Date(now);
          eventDate.setHours(h, m, 0, 0);
          
          const reminderTime = new Date(eventDate.getTime() - offsetMin * 60000);
          const remTimeStr = reminderTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
          
          const uniqueId = `${id}-${label}-${currentFullDate}-${remTimeStr}`;
          
          if (currentTimeStr === remTimeStr && !notifiedIds.current.has(uniqueId)) {
            notifiedIds.current.add(uniqueId);
            
            if (notifications.soundEnabled) {
              playNotificationSound(notifications.soundName, notifications.volume);
            }

            // Show UI notification
            setActiveNotification({
              id: uniqueId,
              title: task.title,
              body: label,
              type: label.includes('начинается') ? 'start' : label.includes('окончено') ? 'end' : 'reminder',
              timestamp: Date.now()
            });

            if ("Notification" in window) {
              if (Notification.permission === "granted") {
                new Notification(task.title, {
                  body: label,
                  icon: '/favicon.ico'
                });
              } else if (Notification.permission !== "denied") {
                Notification.requestPermission().then(permission => {
                  if (permission === "granted") {
                    new Notification(task.title, {
                      body: label,
                      icon: '/favicon.ico'
                    });
                  }
                });
              }
            }
          }
        };

        const durationStr = getDuration(startTime, endTime);

        if (notifications.onStart) checkReminder(startTime, 0, `Занятие начинается! Длительность: ${durationStr}`);
        if (notifications.onEnd) checkReminder(endTime, 0, `Занятие окончено! Длительность выполнения: ${durationStr}`);
        if (notifications.reminderMinutes > 0) {
          checkReminder(startTime, notifications.reminderMinutes, `Начнется через ${notifications.reminderMinutes} мин. Длительность: ${durationStr}`);
        }
      });

      // Periodic cleanup of notifiedIds to prevent memory leak (keep last 1000)
      if (notifiedIds.current.size > 1000) {
        const arr = Array.from(notifiedIds.current);
        notifiedIds.current = new Set(arr.slice(-500));
      }
    };

    const timer = setInterval(checkNotifications, 10000); // Check every 10 seconds
    return () => clearInterval(timer);
  }, [tasks, globalSettings]);

  const playAlarm = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      // Создаем двухтональный сигнал для привлечения внимания
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
      oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5);

      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.0);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 1.0);
    } catch (e) {
      console.error("Audio API not supported or blocked", e);
    }
  };

  useEffect(() => {
    let interval: any = null;
    if (isPomodoroRunning && pomodoroTime > 0) {
      interval = setInterval(() => setPomodoroTime(t => t - 1), 1000);
    } else if (pomodoroTime === 0) {
      setIsPomodoroRunning(false);
      playAlarm();
      
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(pomodoroMode === 'work' ? "Пора отдохнуть!" : "Время работать!");
      }
      
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
    return () => clearInterval(interval);
  }, [isPomodoroRunning, pomodoroTime, pomodoroMode]);

  const togglePomodoro = () => setIsPomodoroRunning(!isPomodoroRunning);
  const resetPomodoro = (mode: 'work' | 'break' = 'work') => {
    setIsPomodoroRunning(false);
    setPomodoroMode(mode);
    setPomodoroTime(mode === 'work' ? 25 * 60 : 5 * 60);
  };

  const formatPomodoroTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isTaskCompletedOnDate = (task: ScheduleTask, date: string) => {
    if (task.isRecurring) {
      return (completedRecurringTasks[date] || []).includes(task.id);
    }
    return task.isCompleted;
  };

  const isTaskVisibleOnDate = (task: ScheduleTask, dateStr: string) => {
    if (!task.isRecurring) return task.date === dateStr;
    
    // Don't show recurring tasks before their starting date
    if (dateStr < task.date) return false;

    if (!task.recurringDays || task.recurringDays.length === 0) return true; // Legacy daily
    
    const date = parseISOToDate(dateStr);
    const dayOfWeek = date.getDay(); // 0 is Sunday
    return task.recurringDays.includes(dayOfWeek);
  };

  const productivityScore = useMemo(() => {
    const dayTasks = tasks.filter(t => isTaskVisibleOnDate(t, selectedDate));
    if (dayTasks.length === 0) return 0;
    const completed = dayTasks.filter(t => isTaskCompletedOnDate(t, selectedDate)).length;
    return Math.round((completed / dayTasks.length) * 100);
  }, [tasks, selectedDate, completedRecurringTasks]);

  // AI Quote Generation
  const generateAiQuote = async () => {
    if (!genAI || isGeneratingQuote) return;

    const offlineQuotes = [
      "Дисциплина — это мост между целями и достижениями.",
      "Твой единственный предел — это ты сам.",
      "Маленькие шаги каждый день ведут к большим результатам.",
      "Начинай там, где ты есть. Используй то, что у тебя есть.",
      "Успех — это сумма малых усилий, повторяемых изо дня в день.",
      "Не останавливайся, пока не будешь гордиться собой.",
      "Твое будущее создается тем, что ты делаешь сегодня.",
      "Будь сильнее своих оправданий.",
      "Твоя энергия — твой самый ценный ресурс."
    ];

    if (!navigator.onLine) {
      setAiQuote(offlineQuotes[Math.floor(Math.random() * offlineQuotes.length)]);
      return;
    }

    setIsGeneratingQuote(true);
    const dayTasks = tasks.filter(t => isTaskVisibleOnDate(t, selectedDate));
    try {
      const response = await (genAI as any).models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ role: "user", parts: [{ text: `Дай очень короткую (max 10 слов) мотивирующую цитату на русском языке для человека, у которого запланировано ${dayTasks.length} задач на сегодня. Темы: ${dayTasks.map(t => t.category).join(', ')}. Без кавычек, только текст.` }] }]
      });
      setAiQuote(response.text || offlineQuotes[0]);
    } catch (e) {
      setAiQuote(offlineQuotes[Math.floor(Math.random() * offlineQuotes.length)]);
    } finally {
      setIsGeneratingQuote(false);
    }
  };

  useEffect(() => {
    if (tasks.length > 0) {
      generateAiQuote();
    }
  }, [tasks.length, selectedDate]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter(t => isTaskVisibleOnDate(t, selectedDate))
      .filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter(t => filterCategory === 'all' ? true : t.category === filterCategory)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [tasks, searchQuery, filterCategory, selectedDate]);

  const handleAddTask = (initialDate: string = getLocalDateString()) => {
    setEditingTask(null);
    setFormData({
      title: '',
      startTime: '09:00',
      endTime: '10:00',
      category: 'study',
      description: '',
      isRecurring: false,
      recurringDays: [0, 1, 2, 3, 4, 5, 6],
      date: initialDate,
      notifications: {
        enabled: true,
        onStart: true,
        onEnd: true,
        reminderMinutes: 5,
        soundEnabled: true,
        soundName: 'default',
        vibrate: true,
        volume: 1
      }
    });
    setIsModalOpen(true);
  };

  const handleEditTask = (task: ScheduleTask, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTask(task);
    setFormData({
      title: task.title,
      startTime: task.startTime,
      endTime: task.endTime,
      category: task.category,
      description: task.description || '',
      isRecurring: task.isRecurring || false,
      recurringDays: task.recurringDays || [0, 1, 2, 3, 4, 5, 6],
      date: task.date,
      notifications: task.notifications || {
        enabled: true,
        onStart: true,
        onEnd: false,
        reminderMinutes: 5,
        soundEnabled: true,
        soundName: 'default',
        vibrate: true,
        volume: 1
      }
    });
    setIsModalOpen(true);
  };

  const handleDeleteTask = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const toggleComplete = (id: string, e: React.MouseEvent, targetDate: string = selectedDate) => {
    e.stopPropagation();
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (task.isRecurring) {
      setCompletedRecurringTasks(prev => {
        const dateCompletions = prev[targetDate] || [];
        const isCurrentlyCompleted = dateCompletions.includes(id);
        
        if (!isCurrentlyCompleted) {
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.8 },
            colors: ['#6366f1', '#10b981', '#f59e0b']
          });
          return { ...prev, [targetDate]: [...dateCompletions, id] };
        } else {
          return { ...prev, [targetDate]: dateCompletions.filter(tid => tid !== id) };
        }
      });
    } else {
      setTasks(prev => prev.map(t => {
        if (t.id === id && !t.isCompleted) {
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.8 },
            colors: ['#6366f1', '#10b981', '#f59e0b']
          });
        }
        return t.id === id ? { ...t, isCompleted: !t.isCompleted } : t;
      }));
    }
  };

  const handleApplyTemplate = (template: typeof QUICK_TEMPLATES[0]) => {
    const now = new Date();
    const start = formatTimeStr(now);
    const end = formatTimeStr(new Date(now.getTime() + template.durationMin * 60000));
    
    const newTask: ScheduleTask = {
      id: Math.random().toString(36).substring(2, 11),
      title: template.title,
      date: getLocalDateString(),
      startTime: start,
      endTime: end,
      category: template.category,
      isCompleted: false,
      isRecurring: false,
      createdAt: Date.now(),
    };
    setTasks(prev => [...prev, newTask]);
  };

  const handleApplyUserRoutine = () => {
    const routine: Partial<ScheduleTask>[] = [
      { title: 'Подъём', startTime: '07:30', endTime: '07:30', category: 'rest', recurringDays: [1, 2, 3, 4, 5, 6] },
      { title: 'Умыться', startTime: '07:30', endTime: '07:45', category: 'other', recurringDays: [1, 2, 3, 4, 5, 6] },
      { title: 'Тренировка', startTime: '07:45', endTime: '08:30', category: 'sport', recurringDays: [1, 2, 3, 4, 5, 6] },
      { title: 'Душ + завтрак', startTime: '08:30', endTime: '09:00', category: 'rest', recurringDays: [1, 2, 3, 4, 5, 6] },
      { title: 'Программирование (Фокус)', startTime: '09:00', endTime: '11:00', category: 'study', recurringDays: [1, 2, 3, 4, 5, 6] },
      { title: 'Помощь по дому / Уборка', startTime: '11:00', endTime: '12:00', category: 'work', recurringDays: [1, 2, 3, 4, 5, 6] },
      { title: 'Еда + сборы', startTime: '12:00', endTime: '13:00', category: 'rest', recurringDays: [1, 2, 3, 4, 5, 6] },
      { title: 'Школа', startTime: '13:30', endTime: '17:40', category: 'work', recurringDays: [1, 2, 3, 4, 5, 6] }, // Mon-Sat
      { title: 'Домой + еда + животные', startTime: '18:00', endTime: '19:15', category: 'other', recurringDays: [1, 2, 3, 4, 5, 6] },
      { title: 'Программирование (Практика)', startTime: '19:15', endTime: '21:00', category: 'study', recurringDays: [1, 2, 3, 4, 5, 6] },
      { title: 'Отдых', startTime: '21:00', endTime: '22:00', category: 'rest', recurringDays: [0, 1, 2, 3, 4, 5, 6] },
      { title: 'Сон', startTime: '22:30', endTime: '23:59', category: 'rest', recurringDays: [0, 1, 2, 3, 4, 5, 6] },
    ];

    const newTasks: ScheduleTask[] = routine.map(item => ({
      id: Math.random().toString(36).substring(2, 11),
      title: item.title!,
      date: getLocalDateString(),
      startTime: item.startTime!,
      endTime: item.endTime!,
      category: item.category as Category,
      isCompleted: false,
      isRecurring: true,
      recurringDays: item.recurringDays,
      createdAt: Date.now(),
    }));

    setTasks(prev => {
      // Filter out existing similar recurring tasks to avoid duplicates if applied twice
      const existingTitles = prev.filter(t => t.isRecurring).map(t => t.title);
      const uniqueNew = newTasks.filter(t => !existingTitles.includes(t.title));
      return [...prev, ...uniqueNew];
    });
    
    alert("Ваш распорядок добавлен как ежедневный!");
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(tasks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setTasks(items);
  };

  const handleClearCompleted = () => {
    if (confirm('Очистить все выполненные задачи?')) {
      setTasks(prev => prev.filter(t => !t.isCompleted));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    const newTask: ScheduleTask = {
      id: editingTask ? editingTask.id : Math.random().toString(36).substring(2, 11),
      title: formData.title,
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime,
      category: formData.category,
      description: formData.description,
      isCompleted: editingTask ? editingTask.isCompleted : false,
      isRecurring: formData.isRecurring,
      recurringDays: formData.recurringDays,
      notifications: formData.notifications,
      createdAt: editingTask ? editingTask.createdAt : Date.now()
    };

    if (editingTask) {
      setTasks(tasks.map(t => t.id === editingTask.id ? newTask : t));
    } else {
      setTasks([...tasks, newTask]);
    }
    setIsModalOpen(false);
  };

  const formatTimeStr = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const isTaskActive = (task: ScheduleTask) => {
    const nowStr = formatTimeStr(currentTime);
    return nowStr >= task.startTime && nowStr <= task.endTime;
  };

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    const targetDate = activeTab === 'calendar' ? calendarSelectedDate : selectedDate;
    const dayTasks = tasks.filter(t => isTaskVisibleOnDate(t, targetDate));
    dayTasks.forEach(t => {
      counts[t.category] = (counts[t.category] || 0) + 1;
    });
    return CATEGORIES.filter(c => counts[c.value]).map(c => ({
      name: c.label,
      value: counts[c.value],
      color: c.color.replace('bg-', '') // approximation
    }));
  }, [tasks, selectedDate, calendarSelectedDate, activeTab]);

  const activeTask = tasks.find(t => isTaskVisibleOnDate(t, selectedDate) && isTaskActive(t));

  const weekDays = useMemo(() => {
    const days = [];
    const baseDate = new Date(selectedDate);
    for (let i = -7; i < 14; i++) {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + i);
      const full = getLocalDateString(date);
      const isToday = full === getLocalDateString();
      days.push({
        full,
        day: date.toLocaleDateString('ru-RU', { day: 'numeric' }),
        weekday: date.toLocaleDateString('ru-RU', { weekday: 'short' }),
        isToday
      });
    }
    return days;
  }, [selectedDate]);

  const changeDate = (offset: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + offset);
    setSelectedDate(getLocalDateString(date));
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-24 sm:pb-8 transition-colors duration-300">
      <AnimatePresence>
        {activeNotification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-24 left-4 right-4 z-[999] sm:left-auto sm:right-6 sm:top-6 sm:bottom-auto sm:w-80"
            onClick={() => setActiveNotification(null)}
          >
            <div className={`p-4 rounded-[2rem] shadow-2xl border flex items-center gap-4 ${
              activeNotification.type === 'start' 
                ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-500/30' 
                : activeNotification.type === 'end'
                  ? 'bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-500/30'
                  : 'bg-indigo-50 border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-500/30'
            }`}>
              <div className={`p-3 rounded-2xl shrink-0 ${
                activeNotification.type === 'start' ? 'bg-emerald-500' : 
                activeNotification.type === 'end' ? 'bg-amber-500' : 'bg-indigo-500'
              } text-white shadow-lg`}>
                {activeNotification.type === 'start' ? <Play size={20} /> : 
                 activeNotification.type === 'end' ? <Clock size={20} /> : <Sparkles size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-0.5">
                  {activeNotification.type === 'start' ? 'Начало' : 
                   activeNotification.type === 'end' ? 'Завершение' : 'Напоминание'}
                </p>
                <h4 className="font-bold text-zinc-900 dark:text-white truncate">{activeNotification.title}</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">{activeNotification.body}</p>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); setActiveNotification(null); }}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-4 py-4 sm:px-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white truncate">Schedule Pro</h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-medium truncate">
               {parseISOToDate(selectedDate).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
             {!isOnline && (
               <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                 <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                 <span className="text-[10px] font-black uppercase tracking-wider">Offline</span>
               </div>
             )}
             <button 
                onClick={() => setIsPomodoroOpen(true)}
                className="p-2 sm:p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-all flex items-center gap-2"
             >
                <Clock size={20} />
                <span className="hidden sm:inline font-bold text-sm">Pomodoro</span>
             </button>
             <button 
                onClick={toggleDarkMode}
                className="p-2 sm:p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
             >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8 pb-32">
        <AnimatePresence mode="wait">
          {activeTab === 'today' && (
            <motion.div
              key="today"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Productivity Score */}
              <div className="bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden relative group">
                <div className="absolute top-0 left-0 h-1 bg-zinc-100 dark:bg-zinc-800 w-full">
                  <motion.div 
                    className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${productivityScore}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Zap size={16} className="text-amber-500 fill-amber-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Продуктивность</span>
                    </div>
                    <h3 className="text-xl font-black text-zinc-900 dark:text-white">
                      Ваш счет: {productivityScore}%
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Выполнено задач</p>
                    <p className="text-lg font-black text-emerald-600">
                      {tasks.filter(t => isTaskVisibleOnDate(t, selectedDate) && isTaskCompletedOnDate(t, selectedDate)).length} / {tasks.filter(t => isTaskVisibleOnDate(t, selectedDate)).length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Templates */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Быстрые шаблоны</span>
                  <button 
                    onClick={handleApplyUserRoutine}
                    className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 hover:opacity-80 transition-opacity"
                  >
                    Загрузить мой распорядок
                  </button>
                </div>
                <div className="flex gap-2 shrink-0 overflow-x-auto pb-2 custom-scrollbar">
                  {QUICK_TEMPLATES.map((tmpl, idx) => (
                    <button 
                      key={idx}
                      onClick={() => handleApplyTemplate(tmpl)}
                      className="flex items-center justify-center gap-2 px-6 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl hover:border-indigo-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all text-sm font-bold shadow-sm whitespace-nowrap active:scale-95"
                    >
                      <Plus size={16} className="text-indigo-500" />
                      <span className="dark:text-white">{tmpl.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Motivation & Current Task Banner */}
              {(aiQuote || activeTask) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {aiQuote && (
                    <div className="bg-indigo-600 p-4 rounded-[2rem] shadow-xl shadow-indigo-500/20 text-white relative overflow-hidden group">
                      <Sparkles className="absolute -right-4 -top-4 text-indigo-400 opacity-20 w-24 h-24 rotate-12 transition-transform group-hover:scale-110" />
                      <div className="flex items-center gap-2 mb-2 relative">
                        <Sparkles size={16} />
                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">AI Мотивация</span>
                      </div>
                      <p className="text-sm sm:text-base font-medium leading-tight relative italic pr-8">
                        "{aiQuote}"
                      </p>
                      <button 
                        onClick={generateAiQuote}
                        className="absolute bottom-4 right-4 p-2 hover:bg-white/10 rounded-full transition-all"
                        disabled={isGeneratingQuote}
                      >
                        <RotateCcw size={14} className={isGeneratingQuote ? "animate-spin" : ""} />
                      </button>
                    </div>
                  )}
                  {activeTask && (
                    <div className="bg-zinc-900 dark:bg-zinc-100 p-4 rounded-[2rem] shadow-xl text-white dark:text-zinc-900 border border-zinc-800 dark:border-zinc-200">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Сейчас в расписании</span>
                      </div>
                      <h4 className="text-lg font-bold truncate">{activeTask.title}</h4>
                      <p className="text-xs opacity-70 font-medium">{activeTask.startTime} – {activeTask.endTime}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Search & Filter Controls */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={18} />
                  <input 
                    type="text"
                    placeholder="Поиск задач..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 sm:py-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium dark:text-white"
                  />
                </div>
                <div className="flex gap-2 shrink-0 overflow-x-auto pb-1 custom-scrollbar">
                  <button 
                    onClick={() => setFilterCategory('all')}
                    className={`px-4 py-3 rounded-2xl text-sm font-bold whitespace-nowrap transition-all border ${
                      filterCategory === 'all' 
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black shadow-lg border-transparent' 
                        : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    Все
                  </button>
                  {CATEGORIES.map(cat => (
                    <button 
                      key={cat.value}
                      onClick={() => setFilterCategory(cat.value)}
                      className={`px-4 py-3 rounded-2xl text-sm font-bold whitespace-nowrap transition-all border ${
                        filterCategory === cat.value 
                          ? `${cat.color} text-white shadow-lg border-transparent` 
                          : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <div className="bg-white dark:bg-zinc-900 p-3 sm:p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col items-center sm:items-start group transition-all hover:shadow-md">
                  <p className="text-[10px] sm:text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Задач</p>
                  <p className="text-xl sm:text-3xl font-bold text-zinc-900 dark:text-white">{tasks.filter(t => isTaskVisibleOnDate(t, selectedDate)).length}</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 p-3 sm:p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col items-center sm:items-start group transition-all hover:shadow-md">
                  <p className="text-[10px] sm:text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Готово</p>
                  <p className="text-xl sm:text-3xl font-bold text-emerald-600">{tasks.filter(t => isTaskVisibleOnDate(t, selectedDate) && isTaskCompletedOnDate(t, selectedDate)).length}</p>
                </div>
                <button 
                  onClick={handleClearCompleted}
                  disabled={tasks.filter(t => isTaskVisibleOnDate(t, selectedDate) && isTaskCompletedOnDate(t, selectedDate)).length === 0}
                  className="bg-zinc-100 dark:bg-zinc-800/50 p-3 sm:p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col items-center sm:items-start group transition-all hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed text-left"
                >
                  <p className="text-[10px] sm:text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1 group-hover:text-red-500">Очистить</p>
                  <p className="text-xl sm:text-3xl font-bold text-zinc-500 dark:text-zinc-600 group-hover:text-red-600 transition-colors">
                    <RotateCcw size={22} className="sm:w-8 sm:h-8" />
                  </p>
                </button>
              </div>

              {/* Schedule List */}
              <div className="space-y-4">
                {filteredTasks.length === 0 ? (
                  <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-[3rem] border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                    <CalendarIcon className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" size={48} />
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium px-6">
                      {searchQuery || filterCategory !== 'all' ? 'По результатам поиска ничего не найдено' : 'Ваше расписание пусто. Начните с добавления задачи!'}
                    </p>
                    {!searchQuery && filterCategory === 'all' && (
                      <button 
                        onClick={() => handleAddTask()}
                        className="mt-6 px-8 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full font-bold hover:scale-105 transition-all shadow-lg inline-flex items-center gap-2"
                      >
                        <Plus size={20} /> Добавить
                      </button>
                    )}
                  </div>
                ) : (
                  <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="tasks-list">
                      {(provided) => (
                        <div 
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className="space-y-4 relative"
                        >
                          <AnimatePresence mode='popLayout'>
                            {filteredTasks.map((task, index) => {
                              const category = CATEGORIES.find(c => c.value === task.category) || CATEGORIES[4];
                              const Icon = category.icon;
                              const isActive = isTaskActive(task);

                              let progress = 0;
                              let remainingMinutes = 0;
                              if (isActive) {
                                const [startH, startM] = task.startTime.split(':').map(Number);
                                const [endH, endM] = task.endTime.split(':').map(Number);
                                const nowH = currentTime.getHours();
                                const nowM = currentTime.getMinutes();
                                const startTotal = startH * 60 + startM;
                                const endTotal = endH * 60 + endM;
                                const nowTotal = nowH * 60 + nowM;
                                progress = ((nowTotal - startTotal) / (endTotal - startTotal)) * 100;
                                remainingMinutes = endTotal - nowTotal;
                              }

                              // Grouping logic based on startTime
                              const getGroup = (timeStr: string) => {
                                const h = parseInt(timeStr.split(':')[0]);
                                if (h < 12) return { id: 0, name: "Утро", icon: <Sun size={14} className="text-amber-500" /> };
                                if (h < 18) return { id: 1, name: "День", icon: <Sparkles size={14} className="text-blue-500" /> };
                                return { id: 2, name: "Вечер", icon: <Moon size={14} className="text-indigo-500" /> };
                              };

                              const currentGroup = getGroup(task.startTime);
                              const prevTask = filteredTasks[index - 1];
                              const prevGroup = prevTask ? getGroup(prevTask.startTime) : null;
                              const isNewGroup = !prevGroup || currentGroup.id !== prevGroup.id;

                              const DraggableAny = Draggable as any;
                              return (
                                <motion.div 
                                  key={task.id} 
                                  layout
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.98 }}
                                  className="space-y-4"
                                >
                                  {isNewGroup && (
                                    <div className="flex items-center gap-2 pt-6 pb-2 px-2">
                                      {currentGroup.icon}
                                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">{currentGroup.name}</span>
                                      <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800 ml-4" />
                                    </div>
                                  )}
                                  <DraggableAny draggableId={task.id.toString()} index={index}>
                                    {(provided: any, snapshot: any) => (
                                      <motion.div
                                        layout
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className={`group relative bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-[2rem] border transition-all duration-300 ${
                                          snapshot.isDragging ? 'shadow-2xl z-50 ring-2 ring-indigo-500 scale-105' : 
                                          isActive 
                                            ? 'border-indigo-600 dark:border-indigo-500 shadow-2xl ring-2 ring-indigo-500/10' 
                                            : 'border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md'
                                        } ${task.isCompleted ? 'opacity-80' : ''}`}
                                      >
                                        {isActive && (
                                          <div className="absolute top-0 left-0 w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-t-[2rem] overflow-hidden">
                                            <motion.div 
                                              className="h-full bg-indigo-500"
                                              initial={{ width: 0 }}
                                              animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                                            />
                                          </div>
                                        )}
                                        
                                        <div className="flex items-start gap-4">
                                          <div 
                                            {...provided.dragHandleProps}
                                            className="pt-4 text-zinc-300 hover:text-zinc-500 cursor-grab active:cursor-grabbing"
                                          >
                                            <GripVertical size={20} />
                                          </div>
                                          <div className={`p-3.5 rounded-2xl ${category.color} text-white shadow-lg shrink-0`}>
                                            <Icon size={24} />
                                          </div>
                                          
                                          <div className="flex-1 min-w-0 pt-0.5">
                                            <div className="flex items-center justify-between mb-1 gap-2">
                                              <div className="flex items-center gap-2 truncate">
                                                <h3 className={`font-bold truncate text-lg sm:text-xl ${isTaskCompletedOnDate(task, selectedDate) ? 'text-zinc-400 dark:text-zinc-600 line-through' : 'text-zinc-900 dark:text-white'}`}>
                                                  {task.title}
                                                </h3>
                                                {isActive && !isTaskCompletedOnDate(task, selectedDate) && (
                                                  <span className="shrink-0 text-[10px] font-bold text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full animate-pulse">
                                                    осталось {remainingMinutes} мин
                                                  </span>
                                                )}
                                                {task.isRecurring && (
                                                  <span className="shrink-0 text-[8px] font-black bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-md uppercase tracking-wider">Ежедневно</span>
                                                )}
                                              </div>
                                              <div className="flex items-center shrink-0">
                                                <button 
                                                  onClick={(e) => handleEditTask(task, e)}
                                                  className="p-2 sm:p-2.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-all"
                                                >
                                                  <Edit2 size={18} />
                                                </button>
                                                <button 
                                                  onClick={(e) => handleDeleteTask(task.id, e)}
                                                  className="p-2 sm:p-2.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-all"
                                                >
                                                  <Trash2 size={18} />
                                                </button>
                                              </div>
                                            </div>
                                            
                                            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                                              <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-lg">
                                                <Clock size={14} />
                                                <span>{task.startTime} – {task.endTime}</span>
                                              </div>
                                              <span className="bg-zinc-50 dark:bg-zinc-900/50 px-2 py-1 rounded-lg border border-zinc-100 dark:border-zinc-800">{category.label}</span>
                                            </div>

                                            {task.description && (
                                              <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2 sm:line-clamp-none">
                                                {task.description}
                                              </p>
                                            )}
                                          </div>

                                          <button 
                                            onClick={(e) => toggleComplete(task.id, e)}
                                            className={`mt-1 p-1 hover:scale-110 transition-all ${isTaskCompletedOnDate(task, selectedDate) ? 'text-emerald-500' : 'text-zinc-300 dark:text-zinc-700 hover:text-zinc-400'}`}
                                          >
                                            {isTaskCompletedOnDate(task, selectedDate) ? <CheckCircle size={36} /> : <Circle size={36} />}
                                          </button>
                                        </div>
                                      </motion.div>
                                    )}
                                  </DraggableAny>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'calendar' && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all">
                 <div className="flex items-center justify-between mb-8">
                   <div className="flex flex-col">
                     <h2 className="text-2xl font-black text-zinc-900 dark:text-white capitalize">
                       {viewMonth.toLocaleDateString('ru-RU', { month: 'long' })}
                     </h2>
                     <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">{viewMonth.getFullYear()}</p>
                   </div>
                   <div className="flex gap-2 bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-2xl">
                     <button 
                       onClick={() => changeMonth(-1)}
                       className="p-2 hover:bg-white dark:hover:bg-zinc-700 rounded-xl transition-all text-zinc-600 dark:text-zinc-400 shadow-sm hover:shadow-md"
                     >
                       <ChevronLeft size={20} />
                     </button>
                     <button 
                       onClick={() => setViewMonth(new Date())}
                       className="px-3 py-1 text-xs font-black uppercase tracking-widest hover:bg-white dark:hover:bg-zinc-700 rounded-xl transition-all text-zinc-600 dark:text-zinc-400"
                     >
                       Сегодня
                     </button>
                     <button 
                       onClick={() => changeMonth(1)}
                       className="p-2 hover:bg-white dark:hover:bg-zinc-700 rounded-xl transition-all text-zinc-600 dark:text-zinc-400 shadow-sm hover:shadow-md"
                     >
                       <ChevronRight size={20} />
                     </button>
                   </div>
                 </div>

                 <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
                   {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                     <div key={day} className="text-center py-2">
                       <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{day}</span>
                     </div>
                   ))}
                 </div>

                 <div className="grid grid-cols-7 gap-1 sm:gap-2">
                   {calendarDays.map((dateObj, idx) => {
                     const isSelected = calendarSelectedDate === dateObj.fullDate;
                     const isToday = getLocalDateString() === dateObj.fullDate;
                     const hasTasks = dateObj.fullDate && tasks.some(t => isTaskVisibleOnDate(t, dateObj.fullDate));
                     
                     if (!dateObj.day) return <div key={idx} className="aspect-square" />;

                     return (
                       <button
                         key={idx}
                         onClick={() => {
                           if (dateObj.fullDate) {
                             setCalendarSelectedDate(dateObj.fullDate);
                           }
                         }}
                         className={`aspect-square relative flex flex-col items-center justify-center rounded-2xl sm:rounded-3xl transition-all border-2 group ${
                           isSelected 
                             ? 'bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-zinc-900 shadow-xl scale-105 z-10' 
                             : isToday
                               ? 'bg-indigo-50 border-indigo-100 text-indigo-600 dark:bg-indigo-900/20 dark:border-indigo-900/40 dark:text-indigo-400'
                               : 'bg-white dark:bg-zinc-900 border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                         }`}
                       >
                         <span className={`text-base sm:text-lg font-black ${isSelected ? '' : 'group-hover:scale-110 transition-transform'}`}>
                           {dateObj.day}
                         </span>
                         {hasTasks && (
                           <div className={`mt-0.5 w-1.5 h-1.5 rounded-full ${isSelected ? (darkMode ? 'bg-zinc-900' : 'bg-white') : (isToday ? 'bg-indigo-500' : 'bg-zinc-300 dark:bg-zinc-700')}`} />
                         )}
                       </button>
                     );
                   })}
                 </div>

                 <div className="mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-4 px-2">
                       <div className="flex items-center gap-2">
                         <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.4)]" />
                         <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Сегодня</span>
                       </div>
                       <div className="flex items-center gap-2">
                         <div className="w-3 h-3 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                         <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Задачи есть</span>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Task Quick Info for selected date */}
              <div className="bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-inner">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex flex-col">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Расписание на</h3>
                    <p className="text-lg font-black text-zinc-900 dark:text-white">
                      {parseISOToDate(calendarSelectedDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                  <button 
                    onClick={() => handleAddTask()}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg"
                  >
                    <Plus size={14} /> Добавить
                  </button>
                </div>

                <div className="space-y-3">
                   {tasks.filter(t => isTaskVisibleOnDate(t, calendarSelectedDate)).length > 0 ? (
                     tasks.filter(t => isTaskVisibleOnDate(t, calendarSelectedDate)).sort((a,b) => a.startTime.localeCompare(b.startTime)).map(task => {
                       const category = CATEGORIES.find(c => c.value === task.category) || CATEGORIES[4];
                       const isCompleted = isTaskCompletedOnDate(task, calendarSelectedDate);
                       
                       return (
                         <div 
                           key={task.id} 
                           className={`flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 transition-all ${isCompleted ? 'opacity-60' : ''}`}
                         >
                           <button 
                             onClick={(e) => toggleComplete(task.id, e, calendarSelectedDate)}
                             className={`shrink-0 transition-colors ${isCompleted ? 'text-emerald-500' : 'text-zinc-200 hover:text-zinc-400'}`}
                           >
                             {isCompleted ? <CheckCircle size={22} /> : <Circle size={22} />}
                           </button>
                           
                           <div className="flex-1 min-w-0" onClick={(e) => handleEditTask(task, e)}>
                             <p className={`text-sm font-bold truncate ${isCompleted ? 'line-through text-zinc-400' : 'dark:text-white'}`}>
                               {task.title}
                             </p>
                             <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-tight">
                               <Clock size={10} className="text-zinc-300" />
                               <span>{task.startTime} – {task.endTime}</span>
                               <span className={`w-1 h-1 rounded-full ${category.color.replace('bg-', 'bg-opacity-50 bg-')}`} />
                               <span className="truncate">{category.label}</span>
                             </div>
                           </div>

                           <div className="flex items-center gap-1">
                             <button 
                               onClick={(e) => handleEditTask(task, e)}
                               className="p-1.5 text-zinc-300 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg transition-all"
                             >
                               <Edit2 size={14} />
                             </button>
                             <button 
                               onClick={(e) => handleDeleteTask(task.id, e)}
                               className="p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all"
                             >
                               <Trash2 size={14} />
                             </button>
                           </div>
                         </div>
                       );
                     })
                   ) : (
                     <div className="py-10 text-center bg-white/50 dark:bg-black/20 rounded-3xl border-2 border-dashed border-zinc-100 dark:border-zinc-800">
                        <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">Нет задач</p>
                     </div>
                   )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'stats' && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="bg-white dark:bg-zinc-900 p-6 sm:p-10 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800">
                <h2 className="text-2xl font-black mb-6">Ваша статистика</h2>
                {tasks.length > 0 ? (
                  <div className="space-y-8">
                    <div className="h-64 mt-4 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <RePieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={8}
                            dataKey="value"
                            stroke="none"
                          >
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color === 'emerald-500' ? '#10b981' : entry.color === 'blue-500' ? '#3b82f6' : entry.color === 'amber-500' ? '#f59e0b' : entry.color === 'indigo-500' ? '#6366f1' : '#71717a'} />
                            ))}
                          </Pie>
                          <ReTooltip 
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                          />
                        </RePieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                        <span className="text-3xl font-black">{tasks.filter(t => isTaskVisibleOnDate(t, activeTab === 'calendar' ? calendarSelectedDate : selectedDate)).length}</span>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Задач</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pb-4">
                      {chartData.map((item, i) => (
                        <div key={i} className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl">
                          <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: item.color === 'emerald-500' ? '#10b981' : item.color === 'blue-500' ? '#3b82f6' : item.color === 'amber-500' ? '#f59e0b' : item.color === 'indigo-500' ? '#6366f1' : '#71717a' }} />
                          <div className="text-left">
                            <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{item.name}</p>
                            <p className="text-xl font-bold dark:text-white">{Math.round((item.value / Math.max(1, tasks.filter(t => isTaskVisibleOnDate(t, activeTab === 'calendar' ? calendarSelectedDate : selectedDate)).length)) * 100)}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-20 text-center">
                    <BarChart3 className="mx-auto text-zinc-200 mb-4" size={64} />
                    <p className="text-zinc-500 font-medium">Добавьте задачи, чтобы увидеть аналитику!</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-6"
            >
              <div className="bg-white dark:bg-zinc-900 p-6 sm:p-10 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800">
                <h2 className="text-2xl font-black mb-8 italic">Настройки</h2>
                
                <div className="space-y-4">
                  {/* Appearance */}
                  <div className="p-1.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 rounded-[1.25rem] shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-xl">
                          {darkMode ? <Moon size={20} /> : <Sun size={20} />}
                        </div>
                        <div>
                          <p className="font-bold text-sm">Тёмная тема</p>
                          <p className="text-[10px] text-zinc-500">Автоматический режим включен</p>
                        </div>
                      </div>
                      <button
                        onClick={toggleDarkMode}
                        className={`w-12 h-6 rounded-full transition-all relative ${darkMode ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${darkMode ? 'right-1' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Notifications */}
                  <div className="p-1.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-3xl border border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 rounded-[1.25rem] shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl">
                          <Bell size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-sm">Уведомления</p>
                          <p className="text-[10px] text-zinc-500">Системные оповещения</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setGlobalSettings(prev => ({ ...prev, allNotificationsEnabled: !prev.allNotificationsEnabled }))}
                        className={`w-12 h-6 rounded-full transition-all relative ${globalSettings.allNotificationsEnabled ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${globalSettings.allNotificationsEnabled ? 'right-1' : 'left-1'}`} />
                      </button>
                    </div>

                    {globalSettings.allNotificationsEnabled && (
                      <div className="p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center justify-between">
                           <span className="text-xs font-bold text-zinc-500">Громкость</span>
                           <input 
                             type="range" 
                             min="0" max="1" step="0.1" 
                             value={globalSettings.globalVolume}
                             onChange={(e) => setGlobalSettings(prev => ({ ...prev, globalVolume: parseFloat(e.target.value) }))}
                             className="w-32 accent-indigo-600"
                           />
                        </div>
                        <div className="flex gap-2">
                           <button 
                             onClick={() => playNotificationSound('default')}
                             className="flex-1 py-2 bg-zinc-100 dark:bg-zinc-700 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-all"
                           >
                              Тест (Default)
                           </button>
                           <button 
                             onClick={() => playNotificationSound('calm')}
                             className="flex-1 py-2 bg-zinc-100 dark:bg-zinc-700 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-all"
                           >
                              Тест (Calm)
                           </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* App Info */}
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-3xl border border-zinc-100 dark:border-zinc-800 flex flex-col items-center text-center">
                      <Info size={24} className="text-zinc-300 mb-2" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Версия</p>
                      <p className="text-lg font-bold">1.2.0</p>
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-3xl border border-zinc-100 dark:border-zinc-800 flex flex-col items-center text-center">
                      <Shield size={24} className="text-emerald-500/50 mb-2" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Статус</p>
                      <p className="text-lg font-bold text-emerald-500">Безопасно</p>
                    </div>
                  </div>

                  <button className="w-full flex items-center justify-between p-5 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-[2rem] font-bold group mt-8">
                     <span className="flex items-center gap-3"><HelpCircle size={20} /> Поддержка</span>
                     <ExternalLink size={18} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2 pointer-events-none">
        <div className="max-w-md mx-auto bg-white/90 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 rounded-[2rem] shadow-2xl p-2 flex items-center justify-between pointer-events-auto">
          {/* Today Tab */}
          <button 
            onClick={() => setActiveTab('today')}
            className={`flex flex-col items-center justify-center flex-1 py-1 gap-1 transition-all ${activeTab === 'today' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}`}
          >
            <div className="relative">
              <ClipboardCheck size={24} />
              {activeTab === 'today' && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-1 bg-indigo-600 dark:bg-indigo-400 rounded-full"
                />
              )}
            </div>
            <span className="text-[10px] font-bold">Сегодня</span>
          </button>

          {/* Calendar Tab */}
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`flex flex-col items-center justify-center flex-1 py-1 gap-1 transition-all ${activeTab === 'calendar' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}`}
          >
            <div className="relative">
              <CalendarDays size={24} />
              {activeTab === 'calendar' && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-1 bg-indigo-600 dark:bg-indigo-400 rounded-full"
                />
              )}
            </div>
            <span className="text-[10px] font-bold">Календарь</span>
          </button>

          {/* Add Button */}
          <div className="flex-1 flex justify-center -mt-10">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleAddTask()}
              className="w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-[0_8px_20px_rgba(79,70,229,0.4)] ring-4 ring-white dark:ring-zinc-900"
            >
              <Plus size={32} />
            </motion.button>
          </div>

          {/* Stats Tab */}
          <button 
            onClick={() => setActiveTab('stats')}
            className={`flex flex-col items-center justify-center flex-1 py-1 gap-1 transition-all ${activeTab === 'stats' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}`}
          >
            <div className="relative">
              <BarChart3 size={24} />
              {activeTab === 'stats' && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-1 bg-indigo-600 dark:bg-indigo-400 rounded-full"
                />
              )}
            </div>
            <span className="text-[10px] font-bold">Статистика</span>
          </button>

          {/* Settings Tab */}
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center flex-1 py-1 gap-1 transition-all ${activeTab === 'settings' ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}`}
          >
            <div className="relative">
              <SettingsIcon size={24} />
              {activeTab === 'settings' && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-1 bg-indigo-600 dark:bg-indigo-400 rounded-full"
                />
              )}
            </div>
            <span className="text-[10px] font-bold">Настройки</span>
          </button>
        </div>
      </nav>

      {/* Modal - Add/Edit */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            />
            <motion.div
              layoutId="modal"
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-[32px] sm:rounded-[32px] shadow-2xl p-6 sm:p-10 overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto mb-8 sm:hidden" />
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                  {editingTask ? 'Редактировать' : 'Новое занятие'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-all">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <div>
                    <h4 className="font-bold text-sm dark:text-white">Повторять ежедневно</h4>
                    <p className="text-[10px] text-zinc-500 font-medium">Задача будет появляться в списке каждый день</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isRecurring: !formData.isRecurring })}
                    className={`w-12 h-6 rounded-full transition-all relative ${formData.isRecurring ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.isRecurring ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                {formData.isRecurring && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Дни недели</label>
                    <div className="flex justify-between gap-1">
                      {[
                        { label: 'Пн', value: 1 },
                        { label: 'Вт', value: 2 },
                        { label: 'Ср', value: 3 },
                        { label: 'Чт', value: 4 },
                        { label: 'Пт', value: 5 },
                        { label: 'Сб', value: 6 },
                        { label: 'Вс', value: 0 }
                      ].map((day) => {
                        const isSelected = formData.recurringDays?.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => {
                              const current = formData.recurringDays || [];
                              const next = isSelected 
                                ? current.filter(d => d !== day.value)
                                : [...current, day.value];
                              setFormData({ ...formData, recurringDays: next });
                            }}
                            className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all border ${
                              isSelected 
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:border-indigo-300'
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Дата</label>
                  <input
                    required
                    type="date"
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800/50 dark:text-white border-2 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-800 rounded-2xl transition-all font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Заголовок</label>
                  <input
                    required
                    autoFocus
                    type="text"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800/50 dark:text-white border-2 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-800 rounded-2xl transition-all font-bold text-lg"
                    placeholder="Название задачи"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Начало</label>
                    <input
                      required
                      type="time"
                      value={formData.startTime}
                      onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800/50 dark:text-white border-2 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-800 rounded-2xl transition-all font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Конец</label>
                    <input
                      required
                      type="time"
                      value={formData.endTime}
                      onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800/50 dark:text-white border-2 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-800 rounded-2xl transition-all font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Выберите цвет категории</label>
                  <div className="grid grid-cols-5 gap-2">
                    {CATEGORIES.map(cat => {
                      const Icon = cat.icon;
                      const isSelected = formData.category === cat.value;
                      return (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, category: cat.value })}
                          className={`flex flex-col items-center justify-center aspect-square gap-1 rounded-2xl transition-all overflow-hidden border-2 group ${
                            isSelected 
                              ? `${cat.color} text-white border-transparent shadow-lg scale-105` 
                              : 'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          <Icon size={20} className={isSelected ? "" : "group-hover:scale-110 transition-transform"} />
                          <span className="text-[10px] font-bold truncate w-full text-center px-1">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] mb-3">Описание</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800/50 dark:text-white border-2 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-800 rounded-2xl transition-all font-medium resize-none shadow-inner"
                    placeholder="Заметки или детали..."
                  />
                </div>

                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-lg">
                        <Bell size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Уведомления</p>
                        <p className="text-[9px] text-zinc-500">Система оповещений</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData({ 
                        ...formData, 
                        notifications: { ...formData.notifications, enabled: !formData.notifications.enabled } 
                      })}
                      className={`w-10 h-5 rounded-full transition-all relative ${formData.notifications.enabled ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${formData.notifications.enabled ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                  </div>

                  {formData.notifications.enabled && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-4 overflow-hidden pt-2"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={formData.notifications.onStart}
                            onChange={() => setFormData({ ...formData, notifications: { ...formData.notifications, onStart: !formData.notifications.onStart } })}
                            className="w-4 h-4 rounded accent-indigo-600"
                          />
                          <span className="text-[10px] font-bold uppercase text-zinc-600 dark:text-zinc-400">Старт</span>
                        </label>
                        <label className="flex items-center gap-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={formData.notifications.onEnd}
                            onChange={() => setFormData({ ...formData, notifications: { ...formData.notifications, onEnd: !formData.notifications.onEnd } })}
                            className="w-4 h-4 rounded accent-indigo-600"
                          />
                          <span className="text-[10px] font-bold uppercase text-zinc-600 dark:text-zinc-400">Конец</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-4 rounded-2xl">
                        <div>
                          <label className="block text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Напомнить</label>
                          <select 
                            value={formData.notifications.reminderMinutes}
                            onChange={(e) => setFormData({ ...formData, notifications: { ...formData.notifications, reminderMinutes: parseInt(e.target.value) }})}
                            className="w-full bg-transparent text-xs font-bold text-indigo-600 dark:text-indigo-400 outline-none"
                          >
                            <option value="0">Во время</option>
                            <option value="5">За 5 мин</option>
                            <option value="10">За 10 мин</option>
                            <option value="15">За 15 мин</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Звук</label>
                          <div className="flex items-center justify-between">
                            <select 
                              value={formData.notifications.soundName}
                              onChange={(e) => setFormData({ ...formData, notifications: { ...formData.notifications, soundName: e.target.value }})}
                              className="bg-transparent text-xs font-bold text-indigo-600 dark:text-indigo-400 outline-none"
                            >
                              <option value="default">Default</option>
                              <option value="calm">Calm</option>
                              <option value="tech">Tech</option>
                            </select>
                            <button 
                              type="button"
                              onClick={() => playNotificationSound(formData.notifications.soundName, formData.notifications.volume)}
                              className="text-indigo-600"
                            >
                              <Play size={10} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="flex gap-4 pt-4 pb-2">
                  <button
                    type="submit"
                    className="flex-1 px-8 py-5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 rounded-[1.5rem] font-black hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-zinc-900/20 dark:shadow-white/5 uppercase tracking-widest text-sm"
                  >
                    {editingTask ? 'Сохранить изменения' : 'Создать задачу'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal - Stats */}
      <AnimatePresence>
        {isPomodoroOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setIsPomodoroOpen(false)}
               className="absolute inset-0 bg-zinc-950/70 backdrop-blur-md"
            />
            <motion.div
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[3rem] shadow-2xl p-8 sm:p-10 overflow-hidden text-center"
            >
               <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em] mb-6">
                 {pomodoroMode === 'work' ? 'Рабочее время' : 'Время перерыва'}
               </h3>
               
               <div className="text-7xl font-black tabular-nums tracking-tighter mb-8 dark:text-white">
                 {formatPomodoroTime(pomodoroTime)}
               </div>

               <div className="flex justify-center gap-4 mb-8">
                  <button 
                    onClick={togglePomodoro}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl ${
                      isPomodoroRunning 
                        ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 dark:shadow-indigo-900/20'
                    }`}
                  >
                    {isPomodoroRunning ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
                  </button>
                  <button 
                    onClick={() => resetPomodoro(pomodoroMode)}
                    className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-white flex items-center justify-center transition-all"
                  >
                    <Square size={28} />
                  </button>
               </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => resetPomodoro('work')}
                    className={`py-3 rounded-2xl font-bold text-sm transition-all ${
                      pomodoroMode === 'work' 
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black' 
                        : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                    }`}
                  >
                    Работа
                  </button>
                  <button 
                    onClick={() => resetPomodoro('break')}
                    className={`py-3 rounded-2xl font-bold text-sm transition-all ${
                      pomodoroMode === 'break' 
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black' 
                        : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                    }`}
                  >
                    Перерыв
                  </button>
                </div>

                <button 
                  onClick={() => setIsPomodoroOpen(false)}
                  className="mt-8 text-zinc-400 text-xs font-bold uppercase tracking-widest hover:text-zinc-900 dark:hover:text-white transition-all underline underline-offset-4"
                >
                  Скрыть
                </button>
             </motion.div>
           </div>
         )}
       </AnimatePresence>
    </div>
  );
}

