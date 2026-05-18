/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Category } from './types';
import { BookOpen, Dumbbell, Coffee, Briefcase, Plus } from 'lucide-react';

export const CATEGORIES: { value: Category; label: string; color: string; icon: any }[] = [
  { value: 'study', label: 'Учёба', color: 'bg-blue-500', icon: BookOpen },
  { value: 'sport', label: 'Спорт', color: 'bg-emerald-500', icon: Dumbbell },
  { value: 'rest', label: 'Отдых', color: 'bg-amber-500', icon: Coffee },
  { value: 'work', label: 'Работа', color: 'bg-indigo-500', icon: Briefcase },
  { value: 'other', label: 'Другое', color: 'bg-gray-500', icon: Plus },
];

export const STORAGE_KEY = 'schedule_pro_tasks';

export const QUICK_TEMPLATES: { title: string; category: Category; durationMin: number }[] = [
  { title: 'Завтрак', category: 'rest', durationMin: 30 },
  { title: 'Тренировка', category: 'sport', durationMin: 60 },
  { title: 'Чтение', category: 'study', durationMin: 30 },
  { title: 'Работа над проектом', category: 'work', durationMin: 120 },
  { title: 'Медитация', category: 'rest', durationMin: 15 },
];
