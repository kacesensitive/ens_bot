export class UtilsService {
  static hashUsername(username: string): number {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      const char = username.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

  static getRandomUsername(): string {
    const names = ['Chris', 'Jake', 'Rocky', 'Grant', 'Alex'];
    return `ENS_${names[Math.floor(Math.random() * names.length)]}`;
  }

  static getRandomGiftCount(): number {
    return Math.floor(Math.random() * 10) + 1;
  }

  static getSantaMessage(username: string): string {
    if (username.toLowerCase().includes('scottwith')) {
      return "Scott, we've seen your search history. You're on the naughty list.";
    }

    if (username.toLowerCase().includes('creativesteve')) {
      return "Steve, you're obviously on the nice list.";
    }

    const naughtyMessages = [
      `${username}, you are on the naughty list! Better luck next year!`,
      `Oh no, ${username}! You've been naughty this year!`,
      `Sorry, ${username}, but you're on the naughty list!`,
      `Looks like ${username} is on the naughty list. Maybe a trip to Jonks Mountain will help!`,
      `Judge Binch would be very disappointed in you, ${username}. You're on the naughty list!`,
      `You may need to call Tito for advice on how to get on the nice list, ${username}. You're on the naughty list!`,
    ];

    const niceMessages = [
      `${username}, you are on the nice list! Great job!`,
      `Congratulations, ${username}! You're on the nice list!`,
      `Well done, ${username}! You've made it to the nice list!`,
      `How did you do it, ${username}? You're on the nice list! Did you get a wish granted by Jonks?`,
      `${username}, is more dedicated to being nice than Chris is to the Armenian National Soccer Team!`,
      `You're on the nice list, ${username}!`,
    ];

    const isNaughty = this.hashUsername(username) % 2 === 0;
    const messages = isNaughty ? naughtyMessages : niceMessages;
    return messages[Math.floor(Math.random() * messages.length)];
  }
} 