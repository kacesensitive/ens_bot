import { config } from 'dotenv';
import { BotConfig } from '../types';

config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error('Missing required Supabase environment variables');
}

export const botConfig: BotConfig = {
  username: process.env.USERNAME || 'ollama_bot',
  oauth: process.env.OAUTH || 'oauth:1234567890',
  channels: process.env.CHANNEL?.split(',') || ['ollama'],
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
  subgiftResetTime: 300000, // 5 minutes
  reminderInterval: 1500000, // 25 minutes
};

export const EXCEPTION_USERS = ['tighwin', 'everythingnowshow'];
export const DEFAULT_MESSAGE_FORMAT = 'JONKS'; 