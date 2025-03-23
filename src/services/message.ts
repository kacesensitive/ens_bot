import { Format, MessageConfig, Category, MessageVariables } from '../types';
import { DEFAULT_MESSAGE_FORMAT } from '../config';

export class MessageService {
  private messageFormats: Record<string, string> = {};
  private messages: Record<string, MessageConfig> = {};
  private currentFormat: string = DEFAULT_MESSAGE_FORMAT;

  constructor() {
    this.loadFormats();
  }

  private loadFormats() {
    // This will be populated by the bot when formats are loaded from the database
  }

  setFormats(formats: Format[]) {
    this.messageFormats = {};
    this.messages = {};

    formats.forEach((format: Format) => {
      const title = format.title;
      this.messageFormats[title] = format.friendly_name;
      this.messages[title] = {
        SUBSCRIPTION: format.sub_message,
        SUBGIFT: format.gift_message,
        REMINDSUBMISSION: format.remind_message,
        CHARACTERLIMIT: format.character_limit,
      };
    });

    // Validate current format exists
    if (!this.messages[this.currentFormat]) {
      console.warn(`Warning: Default messageFormat "${this.currentFormat}" not found in loaded formats. Using first available format.`);
      this.currentFormat = Object.keys(this.messages)[0] || DEFAULT_MESSAGE_FORMAT;
    }
  }

  setCurrentFormat(format: string) {
    if (this.messages[format]) {
      this.currentFormat = format;
      return true;
    }
    return false;
  }

  getCurrentFormat(): string {
    return this.currentFormat;
  }

  getAvailableFormats(): string[] {
    return Object.keys(this.messageFormats);
  }

  getFormatFriendlyName(format: string): string {
    return this.messageFormats[format] || format;
  }

  getCharacterLimit(): number {
    return this.messages[this.currentFormat]?.CHARACTERLIMIT || 200;
  }

  formatMessage(category: Category, variables: MessageVariables): string {
    let messageTemplate = this.messages[this.currentFormat][category];
    for (const [key, value] of Object.entries(variables)) {
      messageTemplate = messageTemplate.toString().replace(`{${key}}`, value);
    }
    return messageTemplate.toString();
  }

  getReminderMessage(): string {
    return this.messages[this.currentFormat]?.REMINDSUBMISSION || '';
  }
} 