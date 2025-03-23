import tmi from 'tmi.js';
import { botConfig, EXCEPTION_USERS } from './config';
import { DatabaseService } from './services/database';
import { MessageService } from './services/message';
import { UtilsService } from './services/utils';
import { Category, MessageVariables } from './types';

export class Bot {
  private client: tmi.Client;
  private database: DatabaseService;
  private messageService: MessageService;
  private thankedSubgifters: Set<string>;
  private isActive: boolean = true;
  private number1Count: number = 0;
  private number2Count: number = 0;
  private lastReminderTimes: { [username: string]: number } = {};
  private channels: string[];

  constructor() {
    this.client = new tmi.Client({
      identity: {
        username: botConfig.username,
        password: botConfig.oauth,
      },
      channels: botConfig.channels,
    });
    this.channels = botConfig.channels;

    this.database = new DatabaseService();
    this.messageService = new MessageService();
    this.thankedSubgifters = new Set();

    this.setupEventHandlers();
    this.setupIntervals();
  }

  private setupEventHandlers() {
    this.client.on('message', this.handleMessage.bind(this));
    this.client.on('subscription', this.handleSubscription.bind(this));
    this.client.on('subgift', this.handleSubgift.bind(this));
    this.client.on('resub', this.handleResub.bind(this));
    this.client.on('primepaidupgrade', this.handlePrimePaidUpgrade.bind(this));
    this.client.on('giftpaidupgrade', this.handleGiftPaidUpgrade.bind(this));
    this.client.on('anongiftpaidupgrade', this.handleAnonGiftPaidUpgrade.bind(this));
  }

  private setupIntervals() {
    // Reset thankedSubgifters after timeout
    setInterval(() => {
      this.thankedSubgifters.clear();
    }, botConfig.subgiftResetTime);

    // Remind users to submit
    setInterval(this.sendReminders.bind(this), botConfig.reminderInterval);
  }

  private async handleMessage(channel: string, tags: any, message: string, self: boolean) {
    if (self) return;

    this.handleNumberGame(message);

    if (!this.isActive) {
      if (this.isAuthorizedUser(tags.username) && message.toLowerCase() === '!activate') {
        this.isActive = true;
        this.client.say(channel, 'Thank you for activating the bot!');
      }
      return;
    }

    if (message.toLowerCase() === '!santaslist' && tags.username) {
      const response = UtilsService.getSantaMessage(tags.username);
      this.client.say(channel, response);
    }

    if (this.isAuthorizedUser(tags.username)) {
      await this.handleAdminCommands(channel, message);
    }

    if (message.toLowerCase().startsWith('!submit')) {
      await this.handleSubmission(channel, tags, message);
    }
  }

  private handleNumberGame(message: string) {
    if (message === '1') {
      this.number1Count++;
      this.number2Count = 0;
    } else if (message === '2') {
      this.number2Count++;
      this.number1Count = 0;
    } else {
      this.number1Count = 0;
      this.number2Count = 0;
    }

    if (this.number1Count === 5) {
      this.client.say(this.channels[0], '2');
      this.number1Count = 0;
    }
    if (this.number2Count === 5) {
      this.client.say(this.channels[0], '1');
      this.number2Count = 0;
    }
  }

  private async handleAdminCommands(channel: string, message: string) {
    if (message.toLowerCase() === '!reloadformats') {
      await this.reloadFormats(channel);
    } else if (message.toLowerCase().startsWith('!format ')) {
      await this.handleFormatChange(channel, message);
    } else if (message.toLowerCase() === '!deactivate') {
      this.isActive = false;
      this.client.say(channel, 'Thank you for deactivating the bot!');
    } else if (message.toLowerCase() === '!subscription') {
      this.sendMessage(channel, 'SUBSCRIPTION', { username: UtilsService.getRandomUsername() });
    } else if (message.toLowerCase() === '!subgift') {
      this.sendMessage(channel, 'SUBGIFT', {
        username: UtilsService.getRandomUsername(),
        recipient: UtilsService.getRandomUsername(),
      });
    } else if (message.toLowerCase() === '!submysterygift') {
      this.sendMessage(channel, 'SUBGIFT', {
        username: UtilsService.getRandomUsername(),
        recipient: `${UtilsService.getRandomGiftCount()} people`,
      });
    } else if (message.toLowerCase().startsWith('!give ')) {
      await this.handleGiveCommand(channel, message);
    } else if (message.toLowerCase() === '!clearall') {
      await this.handleClearAll(channel);
    }
  }

  private async handleSubmission(channel: string, tags: any, message: string) {
    const isExceptionUser = this.isAuthorizedUser(tags.username);
    const canSubmit = await this.checkCanSubmit(tags.username, isExceptionUser);

    if (!canSubmit) {
      this.client.say(
        channel,
        `Sorry, @${tags.username}, it looks like you haven't earned a submission yet! If you want to submit, subscribe or gift a sub - then try again!`
      );
      return;
    }

    const submissionLength = message.slice('!submit'.length).trim().length;
    const characterLimit = this.messageService.getCharacterLimit();

    if (submissionLength > characterLimit) {
      this.client.say(
        channel,
        `Sorry, @${tags.username}, your submission is too long! Please keep it under ${characterLimit} characters.`
      );
      return;
    }

    if (!isExceptionUser) {
      await this.database.removeOldestSubscriber(tags.username);
    }

    const submission = message.slice('!submit'.length).trim();
    await this.database.saveSubmission(tags.username, submission);
    this.client.say(channel, `Thanks for your submission, @${tags.username}!`);
  }

  private async checkCanSubmit(username: string, isExceptionUser: boolean): Promise<boolean> {
    if (isExceptionUser) return true;

    const { data: subscriberData, error } = await this.database.getSubscribers();
    if (error) {
      console.error('Error checking subscriber status:', error);
      return false;
    }

    return subscriberData.some(sub => sub.username === username.toLowerCase());
  }

  private async reloadFormats(channel: string) {
    const { formats, error } = await this.database.loadFormats();
    if (error) {
      console.error('Error loading formats:', error);
      return;
    }

    this.messageService.setFormats(formats);
    const formatList = this.messageService.getAvailableFormats()
      .map(format => this.messageService.getFormatFriendlyName(format))
      .join(', ');
    this.client.say(channel, `Formats reloaded. Available formats: ${formatList}`);
  }

  private async handleFormatChange(channel: string, message: string) {
    const newFormat = message.split(' ')[1].toUpperCase().replace(' ', '');
    if (this.messageService.setCurrentFormat(newFormat)) {
      await this.database.updateFormatActive(newFormat, true);
      this.client.say(
        channel,
        `Message format changed to ${this.messageService.getFormatFriendlyName(newFormat)}`
      );
    } else {
      this.client.say(
        channel,
        `Invalid format. Available formats: ${this.messageService.getAvailableFormats().join(', ')}`
      );
    }
  }

  private async handleGiveCommand(channel: string, message: string) {
    const username = message.split(' ')[1];
    if (username) {
      await this.database.addSubscriber(username);
      this.client.say(channel, `${username} can now submit!`);
    }
  }

  private async handleClearAll(channel: string) {
    const messagesResult = await this.database.clearAllMessages();
    const subscribersResult = await this.database.clearAllSubscribers();
    
    if (messagesResult.success && subscribersResult.success) {
      this.client.say(channel, 'All messages have been cleared.');
    } else {
      this.client.say(channel, 'Failed to clear messages.');
    }
  }

  private async handleSubscription(channel: string, username: string) {
    if (this.isActive && username.toLowerCase() !== 'ananonymousgifter') {
      this.sendMessage(channel, 'SUBSCRIPTION', { username });
      await this.database.addSubscriber(username);
    }
  }

  private async handleSubgift(channel: string, username: string, streakMonths: number, recipient: string) {
    if (this.isActive && username.toLowerCase() !== 'ananonymousgifter') {
      if (!this.thankedSubgifters.has(username)) {
        this.sendMessage(channel, 'SUBGIFT', { username, recipient });
        this.thankedSubgifters.add(username);
        await this.database.addSubscriber(username);
      }
    }
  }

  private async handleResub(channel: string, username: string, streakMonths: number, msg: string, tags: any, methods: any) {
    if (this.isActive && username.toLowerCase() !== 'ananonymousgifter') {
      this.sendMessage(channel, 'SUBSCRIPTION', { username });
      await this.database.addSubscriber(username);
    }
  }

  private async handlePrimePaidUpgrade(channel: string, username: string, methods: any, tags: any) {
    if (this.isActive && username.toLowerCase() !== 'ananonymousgifter') {
      this.sendMessage(channel, 'SUBSCRIPTION', { username });
      await this.database.addSubscriber(username);
    }
  }

  private async handleGiftPaidUpgrade(channel: string, username: string, methods: any, tags: any) {
    if (this.isActive && username.toLowerCase() !== 'ananonymousgifter') {
      this.sendMessage(channel, 'SUBSCRIPTION', { username });
      await this.database.addSubscriber(username);
    }
  }

  private async handleAnonGiftPaidUpgrade(channel: string, username: string) {
    if (this.isActive && username.toLowerCase() !== 'ananonymousgifter') {
      this.sendMessage(channel, 'SUBSCRIPTION', { username });
      await this.database.addSubscriber(username);
    }
  }

  private async sendReminders() {
    if (!this.isActive) return;

    const { data: subscriberData, error } = await this.database.getSubscribers();
    if (error || !subscriberData.length) return;

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const subscriberList = Array.from(
      new Set(
        subscriberData
          .map((subscriber: any) => subscriber.username)
          .filter((username: string) => {
            if (!this.lastReminderTimes[username] || now - this.lastReminderTimes[username] > oneDay) {
              this.lastReminderTimes[username] = now;
              return true;
            }
            return false;
          })
          .map((username: string) => `@${username}`)
      )
    ).join(' ');

    if (subscriberList.length > 0) {
      this.client.say(
        this.channels[0],
        `Hey ${subscriberList}, just a reminder that you've earned an ${this.messageService.getReminderMessage()}`
      );
    }
  }

  private sendMessage(channel: string, category: Category, variables: MessageVariables) {
    const message = this.messageService.formatMessage(category, variables);
    this.client.say(channel, message);
  }

  private isAuthorizedUser(username: string | undefined): boolean {
    return (
      username === 'tighwin' ||
      username?.toLowerCase() === 'everythingnowshow' ||
      EXCEPTION_USERS.includes(username?.toLowerCase() || '')
    );
  }

  async start() {
    console.log('Starting bot...');
    console.log('Connecting to Twitch chat...');
    
    await this.client.connect();
    console.log('Connected to Twitch chat');
    
    await this.reloadFormats(this.channels[0]);
  }
} 