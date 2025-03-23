import { createClient } from '@supabase/supabase-js';
import { botConfig } from '../config';
import { Format, MessageConfig } from '../types';

export class DatabaseService {
  private supabase;

  constructor() {
    this.supabase = createClient(botConfig.supabaseUrl, botConfig.supabaseKey);
  }

  async loadFormats(): Promise<{ formats: Format[]; error: any }> {
    const { data, error } = await this.supabase.from('formats').select('*');
    return { formats: data || [], error };
  }

  async updateFormatActive(title: string, active: boolean): Promise<{ error: any }> {
    const { error } = await this.supabase
      .from('formats')
      .update({ active })
      .eq('title', title);
    return { error };
  }

  async addSubscriber(username: string): Promise<{ error: any }> {
    const { error } = await this.supabase
      .from('subscribers')
      .insert([{ username: username.toLowerCase() }]);
    return { error };
  }

  async removeOldestSubscriber(username: string): Promise<{ success: boolean; error: any }> {
    const { data, error: fetchError } = await this.supabase
      .from('subscribers')
      .select('*')
      .eq('username', username.toLowerCase())
      .limit(1);

    if (fetchError) {
      return { success: false, error: fetchError };
    }

    if (!data || data.length === 0) {
      return { success: false, error: new Error('No subscriber found') };
    }

    const { error: deleteError } = await this.supabase
      .from('subscribers')
      .delete()
      .eq('id', data[0].id);

    return { success: !deleteError, error: deleteError };
  }

  async getSubscribers(): Promise<{ data: any[]; error: any }> {
    const { data, error } = await this.supabase
      .from('subscribers')
      .select('username');
    return { data: data || [], error };
  }

  async saveSubmission(username: string, text: string): Promise<{ error: any }> {
    const { error } = await this.supabase
      .from('messages')
      .insert([{ author: username, text }]);
    return { error };
  }

  async clearAllMessages(): Promise<{ success: boolean; error: any }> {
    const { error } = await this.supabase
      .from('messages')
      .delete()
      .neq('author', 'randomguy');
    return { success: !error, error };
  }

  async clearAllSubscribers(): Promise<{ success: boolean; error: any }> {
    const { error } = await this.supabase
      .from('subscribers')
      .delete()
      .neq('username', 'randomguy');
    return { success: !error, error };
  }
} 