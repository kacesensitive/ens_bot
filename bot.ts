import tmi from 'tmi.js';
import { config } from 'dotenv';
const thankedSubgifters = new Set();
const subgiftResetTime = 10000;

config();

const MessageFormats = {
    RIDESHARE: 'ride share',
    ODDITIONS: 'odditions',
    FIGUREDRAWING: 'figure drawing',
    OOPSALLRISE: 'oops all rise',
    CALLCENTER: 'call center',
    TALKFIGHT: 'talk fight',
    HELPWANTED: 'help wanted',
    BARLEYSBAR: "barley's bar",
    ANALYZEDEEZ: 'analyze deez',
    PARTYQUEST: 'party quest',
    SHARKSTANK: "shark's tank",
    TOWNHALL: 'town hall',
    VIDEOSTORE: 'video store',
    JONKS: 'jonks',
    ENTV: 'entv',
    LIFTINGSPIRITS: 'lifting spirits',
    FLIGHTRISK: 'flight risk',
    BIGEVENT: 'big event',
} as const;

type MessageFormat = keyof typeof MessageFormats;

const Categories = {
    SUBSCRIPTION: 'subscription',
    SUBGIFT: 'subgift',
} as const;

type Category = keyof typeof Categories;

const Messages: { [key in MessageFormat]: { [key in Category]: string } } = {
    RIDESHARE: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can leave a review for the driver, and we'll display it on stream! Just type your review in the chat, and make sure to tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can leave a review for the driver, and we'll display it on stream! Just type your review in the chat, and make sure to tag @EverythingNowShow so we see it!",
    },
    BIGEVENT: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can give us a Breaking News Headline, and we'll display it on stream! Just type your headline in the chat, and make sure to tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can give us a Breaking News Headline, and we'll display it on stream! Just type your headline in the chat, and make sure to tag @EverythingNowShow so we see it!",
    },
    ODDITIONS: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can submit the name of a Fake Production Company, and we'll display it on stream! Just type your Production Company name in the Chat, and make sure to tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can submit the name of a Fake Production Company, and we'll display it on stream! Just type your Production Company name in the Chat, and make sure to tag @EverythingNowShow so we see it!",
    },
    FIGUREDRAWING: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can name a building on our college campus, and we'll display it on stream! just type your Building Name in the Chat, and make sure to tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can name a building on our college campus, and we'll display it on stream! just type your Building Name in the Chat, and make sure to tag @EverythingNowShow so we see it!",
    },
    OOPSALLRISE: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can submit a piece of written testimony to entered into the record, and we'll display it on stream! Just type your testimony into the Chat, and make sure to tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can submit a piece of written testimony to entered into the record, and we'll display it on stream! Just type your testimony into the Chat, and make sure to tag @EverythingNowShow so we see it!",
    },
    CALLCENTER: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can write a message in our co-workers Greeting Card, and we'll display it on stream! Just type your message in the Chat, and make sure to tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can write a message in our co-workers Greeting Card, and we'll display it on stream! Just type your message in the Chat, and make sure to tag @EverythingNowShow so we see it!",
    },
    TALKFIGHT: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can submit a Fake Company Name as a sponsor of tonight's show, and we'll display it on stream! Just type your Fake Company Name in the chat, and make sure to tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can submit a Fake Company Name as a sponsor of tonight's show, and we'll display it on stream! Just type your Fake Company Name in the chat, and make sure to tag @EverythingNowShow so we see it!",
    },
    HELPWANTED: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can choose somebody to fire! It can be anybody- a celebrity, a fictional character, a real person... just tell who you want to fire, and make sure to tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can choose somebody to fire! It can be anybody- a celebrity, a fictional character, a real person... just tell who you want to fire, and make sure to tag @EverythingNowShow so we see it!",
    },
    BARLEYSBAR: {
        SUBSCRIPTION: "Thanks for the Sub, {username}!",
        SUBGIFT: "Thanks for the Gift Sub, {username}!",
    },
    ANALYZEDEEZ: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can choose a treatment to prescribe the patient! It can be a medication, a lifestyle change... anything you want! We'll display it on stream! Just tell us your prescription in the Chat, and make sure to Tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can choose a treatment to prescribe the patient! It can be a medication, a lifestyle change... anything you want! We'll display it on stream! Just tell us your prescription in the Chat, and make sure to Tag @EverythingNowShow so we see it!",
    },
    PARTYQUEST: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! You've helped us get one step closer to unlocking the Secret Level!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! You've helped us get one step closer to unlocking the Secret Level!",
    },
    SHARKSTANK: {
        SUBSCRIPTION: `Thanks for the Sub, {username}! Every time you subscribe or gift a sub during tonight's show, you get to submit your own one-sentence pitch for the Sharks to react to and bid on! If we get enough subs, we will head over to a MASTER CLASS where you can get business advice from the Richest People In The World!`,
        SUBGIFT: `Thanks for the Gift Sub, {username}! Every time you subscribe or gift a sub during tonight's show, you get to submit your own one-sentence pitch for the Sharks to react to and bid on! If we get enough subs, we will head over to a MASTER CLASS where you can get business advice from the Richest People In The World!`,
    },
    TOWNHALL: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can submit a Public Comment, and we'll display it on the projector screen for the whole town to read! Just type your message in the chat, and make sure to tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can submit a Public Comment, and we'll display it on the projector screen for the whole town to read! Just type your message in the chat, and make sure to tag @EverythingNowShow so we see it!",
    },
    VIDEOSTORE: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can give us a one-sentence movie review, and we'll display it on stream! Just type your review in the chat, and make sure to tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can give us a one-sentence movie review, and we'll display it on stream! Just type your review in the chat, and make sure to tag @EverythingNowShow so we see it!",
    },
    JONKS: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can leave a message in Jonk's Guest Book, and we'll display it on stream! Just type your message in the Chat, and make sure to tag @EverythingNowShow so we see it!!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can leave a message in Jonk's Guest Book, and we'll display it on stream! Just type your message in the Chat, and make sure to tag @EverythingNowShow so we see it!!",
    },
    ENTV: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can submit a Fake Company Name as a sponsor of tonight's show, and we'll display it on stream! Just type your Fake Company Name in the chat, and make sure to tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can submit a Fake Company Name as a sponsor of tonight's show, and we'll display it on stream! Just type your Fake Company Name in the chat, and make sure to tag @EverythingNowShow so we see it!",
    },
    LIFTINGSPIRITS: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can submit a message to be written on the Ghost's Tombstone, and we'll display it on stream! Just type your Tombstone Message in the chat, and make sure to tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can submit a message to be written on the Ghost's Tombstone, and we'll display it on stream! Just type your Tombstone Message in the chat, and make sure to tag @EverythingNowShow so we see it!",
    },
    FLIGHTRISK: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can add a name to our 'FBI Most Wanted List', and we'll display it on stream! Just type the name you want to add in the Chat, and make sure to tag @EverythingNowShow so we see it!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can add a name to our 'FBI Most Wanted List', and we'll display it on stream! Just type the name you want to add in the Chat, and make sure to tag @EverythingNowShow so we see it!",
    },
};

let messageFormat: MessageFormat = 'JONKS';

const opts = {
    identity: {
        username: process.env.USERNAME || 'ollama_bot',
        password: process.env.OAUTH || 'oauth:1234567890'
    },
    channels: process.env.CHANNEL?.split(',') || ['ollama']
};

const client = new tmi.Client(opts);

client.connect().catch(console.error);


// Random username generator
function getRandomUsername() {
    const names = ['Chris', 'Jake', 'Rocky', 'Grant',];
    return `ENS_${names[Math.floor(Math.random() * names.length)]}`;
}

// Random number of gifts generator
function getRandomGiftCount() {
    return Math.floor(Math.random() * 10) + 1;
}

// Reset thankedSubgifters after a specific timeout
const resetThankedSubgifters = () => {
    thankedSubgifters.clear();
};

let isActive = true;

client.on('message', (channel, tags, message, self) => {
    if (self) return;

    if (isActive) {
        if ((tags.mod || tags.username === 'tighwin' || tags.username === 'everythingnowshow') && message.toLowerCase().startsWith('!format ')) {
            const newFormat = message.split(' ')[1].toUpperCase().replace(' ', '') as MessageFormat;
            if (Object.keys(MessageFormats).includes(newFormat)) {
                messageFormat = newFormat;
                client.say(channel, `Message format changed to ${MessageFormats[messageFormat]}`);
            }
        }

        // Set isActive to false
        if ((tags.mod || tags.username === 'tighwin' || tags.username === 'everythingnowshow') && message.toLowerCase() === '!deactivate') {
            isActive = false;
            client.say(channel, 'Thank you for deactivating the bot!');
        }

        // Simulate subscription
        if ((tags.mod || tags.username === 'tighwin' || tags.username === 'everythingnowshow') && message.toLowerCase() === '!subscription') {
            sendMessage(channel, 'SUBSCRIPTION', { username: getRandomUsername() });
        }

        // Simulate subgift
        if ((tags.mod || tags.username === 'tighwin' || tags.username === 'everythingnowshow') && message.toLowerCase() === '!subgift') {
            sendMessage(channel, 'SUBGIFT', { username: getRandomUsername(), recipient: getRandomUsername() });
        }

        // Simulate submysterygift
        if ((tags.mod || tags.username === 'tighwin' || tags.username === 'everythingnowshow') && message.toLowerCase() === '!submysterygift') {
            sendMessage(channel, 'SUBGIFT', { username: getRandomUsername(), recipient: `${getRandomGiftCount()} people` });
        }
    } else if ((tags.mod || tags.username === 'tighwin' || tags.username === 'everythingnowshow') && message.toLowerCase() === '!activate') {
        isActive = true;
        client.say(channel, 'Thank you for activating the bot!');
    } else {
        console.log('Bot is deactivated');
    }
});

client.on('subscription', (channel, username) => {
    sendMessage(channel, 'SUBSCRIPTION', { username });
});

// Updated subgift event
client.on('subgift', (channel, username, streakMonths, recipient) => {
    if (!thankedSubgifters.has(username)) {
        sendMessage(channel, 'SUBGIFT', { username, recipient });
        thankedSubgifters.add(username);
        setTimeout(resetThankedSubgifters, subgiftResetTime);
    }
});

// Handle resub
client.on('resub', (channel, username, streakMonths, msg, tags, methods) => {
    sendMessage(channel, 'SUBSCRIPTION', { username });
});

// Handle primepaidupgrade
client.on('primepaidupgrade', (channel, username, methods, tags) => {
    sendMessage(channel, 'SUBSCRIPTION', { username });
});

function sendMessage(channel: string, category: Category, variables: { [key: string]: string }) {
    let messageTemplate = Messages[messageFormat][category];
    for (const [key, value] of Object.entries(variables)) {
        messageTemplate = messageTemplate.replace(`{${key}}`, value);
    }
    client.say(channel, messageTemplate);
}
