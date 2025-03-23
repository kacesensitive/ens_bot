export interface Format {
  id: number;
  created_at: string;
  title: string;
  values: Record<string, any>;
  sub_message: string;
  gift_message: string;
  remind_message: string;
  character_limit: number;
  friendly_name: string;
  active: boolean;
}

export interface MessageConfig {
  SUBSCRIPTION: string;
  SUBGIFT: string;
  REMINDSUBMISSION: string;
  CHARACTERLIMIT: number;
}

export interface MessageVariables {
  username: string;
  recipient?: string;
}

export type Category = 'SUBSCRIPTION' | 'SUBGIFT' | 'REMINDSUBMISSION' | 'CHARACTERLIMIT';

export interface BotConfig {
  username: string;
  oauth: string;
  channels: string[];
  supabaseUrl: string;
  supabaseKey: string;
  subgiftResetTime: number;
  reminderInterval: number;
} 