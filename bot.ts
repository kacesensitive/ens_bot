import tmi from 'tmi.js';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const thankedSubgifters = new Set();
const subgiftResetTime = 10000;

config();

const supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_KEY || '');

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
    SUBJECTIVEJEOPARDY: 'subjective jeopardy',
} as const;

type MessageFormat = keyof typeof MessageFormats;

const Categories = {
    SUBSCRIPTION: 'subscription',
    SUBGIFT: 'subgift',
} as const;

type Category = keyof typeof Categories;

const Messages: { [key in MessageFormat]: { [key in Category]: string } } = {
    RIDESHARE: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can leave a review for the driver, and we'll display it on stream! Just type !submit followed by your review!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can leave a review for the driver, and we'll display it on stream! Just type !submit followed by your review!",
    },
    BIGEVENT: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can give us a Breaking News Headline, and we'll display it on stream! Just type !submit followed by your headline!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can give us a Breaking News Headline, and we'll display it on stream! Just type !submit followed by your headline!",
    },
    ODDITIONS: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can submit the name of a Fake Production Company, and we'll display it on stream! Just type !submit followed by your company!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can submit the name of a Fake Production Company, and we'll display it on stream! Just type !submit followed by your company!",
    },
    FIGUREDRAWING: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can name a building on our college campus, and we'll display it on stream! Just type !submit followed by your building!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can name a building on our college campus, and we'll display it on stream! Just type !submit followed by your building!",
    },
    OOPSALLRISE: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can submit a piece of written testimony to entered into the record, and we'll display it on stream! Just type !submit followed by your testimony!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can submit a piece of written testimony to entered into the record, and we'll display it on stream! Just type !submit followed by your testimony!",
    },
    CALLCENTER: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can write a message in our co-workers Greeting Card, and we'll display it on stream! Just type !submit followed by your message!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can write a message in our co-workers Greeting Card, and we'll display it on stream! Just type !submit followed by your message!",
    },
    TALKFIGHT: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can submit a Fake Company Name as a sponsor of tonight's show, and we'll display it on stream! Just type !submit followed by your company name!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can submit a Fake Company Name as a sponsor of tonight's show, and we'll display it on stream! Just type !submit followed by your company name!",
    },
    HELPWANTED: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can choose something to add to the job applicant's resume! It can be prior experience, education, or a skill! Just type !submit followed by the text you want to add to the resume!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can choose something to add to the job applicant's resume! It can be prior experience, education, or a skill! Just type !submit followed by the text you want to add to the resume!",
    },
    BARLEYSBAR: {
        SUBSCRIPTION: "Thanks for the Sub, {username}!",
        SUBGIFT: "Thanks for the Gift Sub, {username}!",
    },
    ANALYZEDEEZ: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can choose a treatment to prescribe the patient! It can be a medication, a lifestyle change... anything you want! We'll display it on stream! Just type !submit followed by your prescription!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can choose a treatment to prescribe the patient! It can be a medication, a lifestyle change... anything you want! We'll display it on stream! Just type !submit followed by your prescription!",
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
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can submit a Public Comment, and we'll display it on the projector screen for the whole town to read! Just type !submit followed by your comment!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can submit a Public Comment, and we'll display it on the projector screen for the whole town to read! Just type !submit followed by your comment!",
    },
    VIDEOSTORE: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can give us a one-sentence movie review, and we'll display it on stream! Just type !submit followed by your review!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can give us a one-sentence movie review, and we'll display it on stream! Just type !submit followed by your review!",
    },
    JONKS: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can leave a message in Jonk's Guest Book, and we'll display it on stream! Just type !submit followed by your message!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can leave a message in Jonk's Guest Book, and we'll display it on stream! Just type !submit followed by your message!",
    },
    ENTV: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can submit a Fake Company Name as a sponsor of tonight's show, and we'll display it on stream! Just type !submit followed by your company name!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can submit a Fake Company Name as a sponsor of tonight's show, and we'll display it on stream! Just type !submit followed by your company name!",
    },
    LIFTINGSPIRITS: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can submit a message to be written on the Ghost's Tombstone, and we'll display it on stream! Just type !submit followed by your tombstone message!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can submit a message to be written on the Ghost's Tombstone, and we'll display it on stream! Just type !submit followed by your tombstone message!",
    },
    FLIGHTRISK: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can add a name to our 'FBI Most Wanted List', and we'll display it on stream! Just type !submit followed by the name you want added to the list!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can add a name to our 'FBI Most Wanted List', and we'll display it on stream! Just type !submit followed by the name you want added to the list!",
    },
    SUBJECTIVEJEOPARDY: {
        SUBSCRIPTION: "Thanks for the Sub, {username}! As a reward, you can submit your own question (e.g. 'This is the best dance move'), and we'll use it on the show! Just type !submit followed by your question!",
        SUBGIFT: "Thanks for the Gift Sub, {username}! As a reward, you can submit your own question (e.g. 'This is the best dance move'), and we'll use it on the show! Just type !submit followed by your question!",
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

// Check if a user can submit
async function canSubmit(username: string, isExceptionUser: boolean): Promise<boolean> {
    if (isExceptionUser) return true;

    // Check if the user is a recent subscriber
    const { data: subscriberData, error: subscriberError } = await supabase
        .from('subscribers')
        .select('*')
        .eq('username', username.toLowerCase());

    if (subscriberError) {
        console.error('Error checking subscriber status:', subscriberError);
        return false;
    }

    if (subscriberData.length === 0) {
        return false; // User is not a recent subscriber
    }
    return true;
}

// Save submission to Supabase
async function saveSubmission(username: string, text: string) {
    const { data, error } = await supabase
        .from('messages')
        .insert([
            { "author": username, text }
        ]);

    if (error) {
        console.error('Error saving submission:', error);
    }
}

// Clear all messages
async function clearAllMessages() {
    const { data, error } = await supabase
        .from('messages')
        .delete()
        .neq('author', 'randomguy');

    if (error) {
        console.error('Error clearing messages:', error);
        return false;
    }

    return true;
}

// Clear all subscribers
async function clearAllSubscribers() {
    const { data, error } = await supabase
        .from('subscribers')
        .delete()
        .neq('username', 'randomguy');

    if (error) {
        console.error('Error clearing subscribers:', error);
        return false;
    }

    return true;
}

async function addSubscriber(username: string) {
    const { error } = await supabase
        .from('subscribers')
        .insert([{ username: username.toLowerCase() }]);

    if (error) {
        console.error('Error adding subscriber:', error);
    }
}

async function removeOldestSubscriber(username: string): Promise<boolean> {
    const { data, error: fetchError } = await supabase
        .from('subscribers')
        .select('*')
        .eq('username', username.toLowerCase())
        .limit(1);

    if (fetchError) {
        console.error('Error fetching oldest subscriber:', fetchError);
        return false;
    }

    if (data.length === 0) {
        console.log('No subscriber found for username:', username);
        return false;
    }

    const oldestSubscriberId = data[0].id;

    const { error: deleteError } = await supabase
        .from('subscribers')
        .delete()
        .eq('id', oldestSubscriberId);

    if (deleteError) {
        console.error('Error removing subscriber:', deleteError);
        return false;
    }

    return true;
}


let isActive = true;

client.on('message', async (channel, tags, message, self) => {
    if (self) return;

    if (isActive) {
        if ((tags.mod || tags.username === 'tighwin' || tags.username?.toLowerCase() === 'everythingnowshow') && message.toLowerCase().startsWith('!format ')) {
            const newFormat = message.split(' ')[1].toUpperCase().replace(' ', '') as MessageFormat;
            if (Object.keys(MessageFormats).includes(newFormat)) {
                messageFormat = newFormat;
                client.say(channel, `Message format changed to ${MessageFormats[messageFormat]}`);
            }
        }

        // Set isActive to false
        if ((tags.mod || tags.username === 'tighwin' || tags.username?.toLowerCase() === 'everythingnowshow') && message.toLowerCase() === '!deactivate') {
            isActive = false;
            client.say(channel, 'Thank you for deactivating the bot!');
        }

        // Simulate subscription
        if ((tags.mod || tags.username === 'tighwin' || tags.username?.toLowerCase() === 'everythingnowshow') && message.toLowerCase() === '!subscription') {
            sendMessage(channel, 'SUBSCRIPTION', { username: getRandomUsername() });
        }

        // Simulate subgift
        if ((tags.mod || tags.username === 'tighwin' || tags.username?.toLowerCase() === 'everythingnowshow') && message.toLowerCase() === '!subgift') {
            sendMessage(channel, 'SUBGIFT', { username: getRandomUsername(), recipient: getRandomUsername() });
        }

        // Simulate submysterygift
        if ((tags.mod || tags.username === 'tighwin' || tags.username?.toLowerCase() === 'everythingnowshow') && message.toLowerCase() === '!submysterygift') {
            sendMessage(channel, 'SUBGIFT', { username: getRandomUsername(), recipient: `${getRandomGiftCount()} people` });
        }

        if (message.toLowerCase().startsWith('!submit')) {
            const isExceptionUser = tags.username === 'tighwin' || tags.username?.toLowerCase() === 'everythingnowshow';
            if (await canSubmit(tags.username || '-', isExceptionUser)) {
                if (!isExceptionUser) {
                    await removeOldestSubscriber(tags.username || '-');
                }
                const submission = message.slice('!submit'.length).trim();
                await saveSubmission(tags.username || '-', submission);
                client.say(channel, `Thanks for your submission, ${tags.username}!`);
            } else {
                client.say(channel, `Sorry, ${tags.username}, it looks like you haven't earned a submission yet! If you want to submit, subscribe or gift a sub - then try again!`);
            }
        }

        if (message.toLowerCase() === '!clearall') {
            if (tags.username === 'tighwin' || tags.username?.toLowerCase() === 'everythingnowshow') {
                const success = await clearAllMessages();
                const success2 = await clearAllSubscribers();
                if (success && success2) {
                    client.say(channel, 'All messages have been cleared.');
                } else {
                    client.say(channel, 'Failed to clear messages.');
                }
            } else {
                client.say(channel, `Sorry, ${tags.username}, you are not authorized to perform this action.`);
            }
        }

    } else if ((tags.mod || tags.username === 'tighwin' || tags.username?.toLowerCase() === 'everythingnowshow') && message.toLowerCase() === '!activate') {
        isActive = true;
        client.say(channel, 'Thank you for activating the bot!');
    } else {
        console.log('Bot is deactivated');
    }
});

client.on('subscription', async (channel, username) => {
    if (isActive && username.toLowerCase() !== 'ananonymousgifter') {
        sendMessage(channel, 'SUBSCRIPTION', { username });
        await addSubscriber(username);
    }
});

// Updated subgift event
client.on('subgift', async (channel, username, streakMonths, recipient) => {
    if (isActive && username.toLowerCase() !== 'ananonymousgifter') {
        if (!thankedSubgifters.has(username)) {
            sendMessage(channel, 'SUBGIFT', { username, recipient });
            thankedSubgifters.add(username);
            await addSubscriber(username);
            setTimeout(resetThankedSubgifters, subgiftResetTime);
        }
    }
});

// Handle resub
client.on('resub', async (channel, username, streakMonths, msg, tags, methods) => {
    if (isActive && username.toLowerCase() !== 'ananonymousgifter') {
        sendMessage(channel, 'SUBSCRIPTION', { username });
        await addSubscriber(username);
    }
});

// Handle primepaidupgrade
client.on('primepaidupgrade', async (channel, username, methods, tags) => {
    if (isActive && username.toLowerCase() !== 'ananonymousgifter') {
        sendMessage(channel, 'SUBSCRIPTION', { username });
        await addSubscriber(username);
    }
});

// Handle giftpaidupgrade
client.on('giftpaidupgrade', async (channel, username, methods, tags) => {
    if (isActive && username.toLowerCase() !== 'ananonymousgifter') {
        sendMessage(channel, 'SUBSCRIPTION', { username });
        await addSubscriber(username);
    }
});

// Handle anongiftpaidupgrade
client.on('anongiftpaidupgrade', async (channel, username) => {
    if (isActive && username.toLowerCase() !== 'ananonymousgifter') {
        sendMessage(channel, 'SUBSCRIPTION', { username });
        await addSubscriber(username);
    }
});

function sendMessage(channel: string, category: Category, variables: { [key: string]: string }) {
    let messageTemplate = Messages[messageFormat][category];
    for (const [key, value] of Object.entries(variables)) {
        messageTemplate = messageTemplate.replace(`{${key}}`, value);
    }
    client.say(channel, messageTemplate);
}
