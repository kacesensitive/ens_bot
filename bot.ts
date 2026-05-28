import tmi from "tmi.js";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const thankedSubgifters = new Set();
const subgiftResetTime = 10000;
const CREDIT_ELIGIBLE_TIERS = new Set(
  [
    "Production Crew",
    "Newscasters",
    "Council Members",
    "Hot Dog Standees",
    "Now York Flight Attendants",
  ].map((tier) => tier.toLowerCase())
);
const PATREON_CREDIT_NOTIFY_COOLDOWN_MS = 10 * 60 * 1000;
const PATREON_CREDIT_NOTIFY_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
console.log("Starting bot...");
console.log("Connecting to Twitch chat...");

config();

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_KEY || ""
);

interface Format {
  id: number;
  created_at: string;
  title: string;
  values: Record<string, any>;
  sub_message: string;
  gift_message: string;
  remind_message: string;
  character_limit: number;
  friendly_name: string;
}

let Messages: Record<
  string,
  {
    SUBSCRIPTION: string;
    SUBGIFT: string;
    REMINDSUBMISSION: string;
    CHARACTERLIMIT: number;
  }
> = {};

let MessageFormats: Record<string, string> = {};

async function loadFormats() {
  const { data: formats, error } = await supabase.from("formats").select("*");

  if (error) {
    console.error("Error loading formats:", error);
    return;
  }

  Messages = {};
  MessageFormats = {};

  formats.forEach((format: Format) => {
    const title = format.title;
    MessageFormats[title] = format.friendly_name;
    Messages[title] = {
      SUBSCRIPTION: format.sub_message,
      SUBGIFT: format.gift_message,
      REMINDSUBMISSION: format.remind_message,
      CHARACTERLIMIT: format.character_limit,
    };
  });
}

// Load formats on startup
loadFormats();

// Reload formats every hour
setInterval(loadFormats, 60 * 60 * 1000);

const Categories = {
  SUBSCRIPTION: "subscription",
  SUBGIFT: "subgift",
  REMINDSUBMISSION: "remind",
  CHARACTERLIMIT: 200,
} as const;

type Category = keyof typeof Categories;

let messageFormat = "JONKS";

const opts = {
  identity: {
    username: process.env.USERNAME || "ollama_bot",
    password: process.env.OAUTH || "oauth:1234567890",
  },
  channels: process.env.CHANNEL?.split(",") || ["ollama"],
};

const client = new tmi.Client(opts);

client.connect().then(() => {
  console.log("Connected to Twitch chat");
});

function hashUsername(username: string): number {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    const char = username.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

function getSantaMessage(username: string): string {
  // if the username contains "scottwith" then the message is "Scott, we've seen your search history. You're on the naughty list."
  if (username.toLowerCase().includes("scottwith")) {
    return "Scott, we've seen your search history. You're on the naughty list.";
  }

  // if the username contains "creativesteve" then the message is "Steve, you're obviously on the nice list."
  if (username.toLowerCase().includes("creativesteve")) {
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

  const isNaughty = hashUsername(username) % 2 === 0;
  const messages = isNaughty ? naughtyMessages : niceMessages;
  return messages[Math.floor(Math.random() * messages.length)];
}

// Random username generator
function getRandomUsername() {
  const names = ["Chris", "Jake", "Rocky", "Grant", "Alex"];
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
async function canSubmit(
  username: string,
  isExceptionUser: boolean
): Promise<boolean> {
  if (isExceptionUser) return true;

  // Check if the user has any credits (including Patreon)
  const { data: subscriberData, error: subscriberError } = await supabase
    .from("subscribers")
    .select("*")
    .eq("username", username.toLowerCase());

  if (subscriberError) {
    console.error("Error checking subscriber status:", subscriberError);
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
    .from("messages")
    .insert([{ author: username, text }]);

  if (error) {
    console.error("Error saving submission:", error);
  }
}

// Clear all messages
async function clearAllMessages() {
  const { data, error } = await supabase
    .from("messages")
    .delete()
    .neq("author", "randomguy");

  if (error) {
    console.error("Error clearing messages:", error);
    return false;
  }

  return true;
}

// Clear all subscribers
async function clearAllSubscribers() {
  const { data, error } = await supabase
    .from("subscribers")
    .delete()
    .neq("username", "randomguy")
    .or("from_patreon.is.null,from_patreon.eq.false");

  if (error) {
    console.error("Error clearing subscribers:", error);
    return false;
  }

  return true;
}

async function addSubscriber(username: string) {
  const { error } = await supabase
    .from("subscribers")
    .insert([{ username: username.toLowerCase() }]);

  if (error) {
    console.error("Error adding subscriber:", error);
  }
}

async function addPatreonSubscriber(username: string) {
  const currentCount = await getPatreonCreditCount(username);
  if (currentCount >= 5) {
    console.log(`${username} already has ${currentCount} Patreon credits (max 5)`);
    return false;
  }

  const { error } = await supabase
    .from("subscribers")
    .insert([{ username: username.toLowerCase(), from_patreon: true }]);

  if (error) {
    console.error("Error adding Patreon subscriber:", error);
    return false;
  }
  return true;
}

async function getCreditCount(username: string): Promise<number> {
  const { count, data, error } = await supabase
    .from("subscribers")
    .select("id", { count: "exact", head: true })
    .eq("username", username.toLowerCase());

  if (error) {
    console.error("Error fetching credit count:", error);
    return 0;
  }

  if (typeof count === "number") {
    return count;
  }

  return data?.length ?? 0;
}

async function getPatreonCreditCount(username: string): Promise<number> {
  const { count, data, error } = await supabase
    .from("subscribers")
    .select("id", { count: "exact", head: true })
    .eq("username", username.toLowerCase())
    .eq("from_patreon", true);

  if (error) {
    console.error("Error fetching Patreon credit count:", error);
    return 0;
  }

  if (typeof count === "number") {
    return count;
  }

  return data?.length ?? 0;
}

function normalizeTierTitle(title: string): string {
  return title.trim().toLowerCase();
}

function parseEntitledTiers(
  value: unknown
): Array<{ id: string; title: string }> {
  const coerceTier = (
    item: unknown
  ): { id: string; title: string } | null => {
    if (!item || typeof item !== "object") {
      return null;
    }
    const record = item as { id?: unknown; title?: unknown };
    if (typeof record.id !== "string" || typeof record.title !== "string") {
      return null;
    }
    return { id: record.id, title: record.title };
  };

  const fromArray = (items: unknown[]): Array<{ id: string; title: string }> =>
    items
      .map(coerceTier)
      .filter((tier): tier is { id: string; title: string } => tier !== null);

  if (Array.isArray(value)) {
    return fromArray(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return fromArray(parsed);
      }
    } catch {
      return [];
    }
  }

  return [];
}

function isPatreonEligible(patron: {
  is_follower: boolean;
  currently_entitled_tiers: unknown;
  currently_entitled_amount_cents: number | null;
  patron_status: string | null;
}): boolean {
  if (patron.is_follower) {
    return false;
  }

  const tiers = parseEntitledTiers(patron.currently_entitled_tiers);
  const hasEligibleTier = tiers.some((tier) =>
    CREDIT_ELIGIBLE_TIERS.has(normalizeTierTitle(tier.title || ""))
  );
  const isPaying = (patron.currently_entitled_amount_cents ?? 0) > 0;
  const isActive = patron.patron_status === "active_patron";

  return hasEligibleTier && isPaying && isActive;
}

const patreonNotifyLastChecked = new Map<string, number>();
const patreonNotifyLastSent = new Map<string, number>();

async function maybeNotifyPatreonCredits(
  channel: string,
  username: string
): Promise<void> {
  try {
    const normalized = username.toLowerCase();
    const lastChecked = patreonNotifyLastChecked.get(normalized);
    if (
      typeof lastChecked === "number" &&
      Date.now() - lastChecked < PATREON_CREDIT_NOTIFY_COOLDOWN_MS
    ) {
      return;
    }
    patreonNotifyLastChecked.set(normalized, Date.now());

    const lastSent = patreonNotifyLastSent.get(normalized);
    if (
      typeof lastSent === "number" &&
      Date.now() - lastSent < PATREON_CREDIT_NOTIFY_MIN_INTERVAL_MS
    ) {
      return;
    }

    const { data: patronData, error: patronError } = await supabase
      .from("patrons")
      .select(
        "currently_entitled_tiers, is_follower, currently_entitled_amount_cents, patron_status"
      )
      .eq("twitch_username", normalized);

    if (patronError) {
      console.error("Error checking Patreon status:", patronError);
      return;
    }

    if (!patronData || patronData.length === 0) {
      return;
    }

    const eligible = patronData.some((patron: any) =>
      isPatreonEligible(patron)
    );
    if (!eligible) {
      return;
    }

    const creditCount = await getPatreonCreditCount(normalized);
    if (creditCount <= 0) {
      return;
    }

    const plural = creditCount === 1 ? "submission" : "submissions";
    client.say(
      channel,
      `Hey ${username}! You've got ${creditCount} bonus ${plural} from your Patreon.`
    );
    patreonNotifyLastSent.set(normalized, Date.now());
  } catch (error) {
    console.error("Error notifying Patreon credits:", error);
  }
}

async function removeOldestSubscriber(username: string): Promise<boolean> {
  // Prioritize consuming normal (non-Patreon) credits first
  const { data: normalData, error: normalError } = await supabase
    .from("subscribers")
    .select("*")
    .eq("username", username.toLowerCase())
    .or("from_patreon.is.null,from_patreon.eq.false")
    .order("id", { ascending: true })
    .limit(1);

  if (normalError) {
    console.error("Error fetching normal subscriber:", normalError);
    return false;
  }

  if (normalData.length > 0) {
    const { error: deleteError } = await supabase
      .from("subscribers")
      .delete()
      .eq("id", normalData[0].id);

    if (deleteError) {
      console.error("Error removing subscriber:", deleteError);
      return false;
    }
    return true;
  }

  // No normal credits — fall back to oldest Patreon credit
  const { data: patreonData, error: patreonError } = await supabase
    .from("subscribers")
    .select("*")
    .eq("username", username.toLowerCase())
    .eq("from_patreon", true)
    .order("id", { ascending: true })
    .limit(1);

  if (patreonError) {
    console.error("Error fetching Patreon subscriber:", patreonError);
    return false;
  }

  if (patreonData.length === 0) {
    console.log("No subscriber found for username:", username);
    return false;
  }

  const { error: deleteError } = await supabase
    .from("subscribers")
    .delete()
    .eq("id", patreonData[0].id);

  if (deleteError) {
    console.error("Error removing Patreon subscriber:", deleteError);
    return false;
  }

  return true;
}

let number1Count = 0;
let number2Count = 0;

let isActive = true;

client.on("message", async (channel, tags, message, self) => {
  if (self) return;
  console.log(message);

  // if 5 "1" are sent in a row send a "2" in chat and vice versa
  if (message === "1") {
    number1Count++;
    number2Count = 0;
  } else if (message === "2") {
    number2Count++;
    number1Count = 0;
  } else {
    number1Count = 0;
    number2Count = 0;
  }
  if (number1Count === 5) {
    client.say(channel, "2");
    number1Count = 0;
  }
  if (number2Count === 5) {
    client.say(channel, "1");
    number2Count = 0;
  }

  if (isActive) {
    if (tags.username) {
      void maybeNotifyPatreonCredits(channel, tags.username);
    }

    // Santaslist command
    if (
      messageFormat === "NAUGHTYORNICE" &&
      message.toLowerCase() === "!santaslist" &&
      tags.username
    ) {
      const response = getSantaMessage(tags.username);
      client.say(channel, response);
    }

    // Reload formats command
    if (
      (tags.username === "tighwin" ||
        tags.username?.toLowerCase() === "everythingnowshow") &&
      message.toLowerCase() === "!reloadformats"
    ) {
      await loadFormats();
      const formatList = Object.entries(MessageFormats)
        .map(([key, friendlyName]) => friendlyName)
        .join(", ");
      client.say(channel, `Formats reloaded. Available formats: ${formatList}`);
    }

    if (
      (tags.mod ||
        tags.username === "tighwin" ||
        tags.username?.toLowerCase() === "everythingnowshow") &&
      message.toLowerCase().startsWith("!format ")
    ) {
      const newFormat = message.split(" ")[1].toUpperCase().replace(" ", "");
      if (MessageFormats[newFormat]) {
        messageFormat = newFormat;

        // Update active status in database
        const { error: updateError } = await supabase
          .from("formats")
          .update({ active: false })
          .neq("title", newFormat);

        if (updateError) {
          console.error("Error updating formats:", updateError);
          return;
        }

        const { error: setActiveError } = await supabase
          .from("formats")
          .update({ active: true })
          .eq("title", newFormat);

        if (setActiveError) {
          console.error("Error setting active format:", setActiveError);
          return;
        }

        client.say(
          channel,
          `Message format changed to ${MessageFormats[newFormat]}`
        );
      } else {
        client.say(
          channel,
          `Invalid format. Available formats: ${Object.keys(
            MessageFormats
          ).join(", ")}`
        );
      }
    }

    // Set isActive to false
    if (
      (tags.mod ||
        tags.username === "tighwin" ||
        tags.username?.toLowerCase() === "everythingnowshow") &&
      message.toLowerCase() === "!deactivate"
    ) {
      isActive = false;
      client.say(channel, "Thank you for deactivating the bot!");
    }

    // Simulate subscription
    if (
      (tags.mod ||
        tags.username === "tighwin" ||
        tags.username?.toLowerCase() === "everythingnowshow") &&
      message.toLowerCase() === "!subscription"
    ) {
      sendMessage(channel, "SUBSCRIPTION", { username: getRandomUsername() });
    }

    // Simulate subgift
    if (
      (tags.mod ||
        tags.username === "tighwin" ||
        tags.username?.toLowerCase() === "everythingnowshow") &&
      message.toLowerCase() === "!subgift"
    ) {
      sendMessage(channel, "SUBGIFT", {
        username: getRandomUsername(),
        recipient: getRandomUsername(),
      });
    }

    // Simulate submysterygift
    if (
      (tags.mod ||
        tags.username === "tighwin" ||
        tags.username?.toLowerCase() === "everythingnowshow") &&
      message.toLowerCase() === "!submysterygift"
    ) {
      sendMessage(channel, "SUBGIFT", {
        username: getRandomUsername(),
        recipient: `${getRandomGiftCount()} people`,
      });
    }

    // Give a user the ability to submit
    if (
      (tags.mod ||
        tags.username === "tighwin" ||
        tags.username?.toLowerCase() === "everythingnowshow") &&
      message.toLowerCase().startsWith("!give")
    ) {
      const username = message.split(" ")[1];
      if (username) {
        await addSubscriber(username);
        client.say(channel, `${username} can now submit!`);
      }
    }

    // Add Patreon subscriber (test command)
    if (
      (tags.mod ||
        tags.username === "tighwin" ||
        tags.username?.toLowerCase() === "everythingnowshow") &&
      message.toLowerCase().startsWith("!addpatreon")
    ) {
      const username = message.split(" ")[1];
      if (username) {
        const success = await addPatreonSubscriber(username);
        if (success) {
          client.say(
            channel,
            `🎉 ${username} has been given a Patreon submission credit!`
          );
        } else {
          client.say(
            channel,
            `Error: Failed to add Patreon credit for ${username}.`
          );
        }
      } else {
        client.say(channel, `Usage: !addpatreon <username>`);
      }
    }

    if (message.toLowerCase() === "!credits" && tags.username) {
      const creditCount = await getCreditCount(tags.username);
      const creditLabel = creditCount === 1 ? "credit" : "credits";
      client.say(
        channel,
        `Hey ${tags.username}, you have ${creditCount} ${creditLabel}!`
      );
    }

    if (message.toLowerCase().startsWith("!submit")) {
      if (message.toLowerCase().startsWith("!submit")) {
        const isExceptionUser =
          tags.username === "tighwin" ||
          tags.username?.toLowerCase() === "everythingnowshow";
        if (await canSubmit(tags.username || "-", isExceptionUser)) {
          const submissionLength = message
            .slice("!submit".length)
            .trim().length;
          const characterLimit = Number(Messages[messageFormat].CHARACTERLIMIT);

          if (submissionLength > characterLimit) {
            client.say(
              channel,
              `Sorry, @${tags.username}, your submission is too long! Please keep it under ${characterLimit} characters.`
            );
          } else {
            await removeOldestSubscriber(tags.username || "-");
            const submission = message.slice("!submit".length).trim();
            await saveSubmission(tags.username || "-", submission);
            try {
              console.log(`Thanks for your submission, @${tags.username}!`);
              client.say(
                channel,
                `Thanks for your submission, @${tags.username}!`
              );
            } catch (error) {
              console.error("Error sending message:", error);
            }
          }
        } else {
          client.say(
            channel,
            `Sorry, @${tags.username}, it looks like you haven't earned a submission yet! If you want to submit, subscribe or gift a sub - then try again!`
          );
        }
      }
    }

    if (message.toLowerCase() === "!clearall") {
      if (
        tags.username === "tighwin" ||
        tags.username?.toLowerCase() === "everythingnowshow"
      ) {
        const success = await clearAllMessages();
        const success2 = await clearAllSubscribers();
        if (success && success2) {
          client.say(channel, "All messages have been cleared.");
        } else {
          client.say(channel, "Failed to clear messages.");
        }
      } else {
        client.say(
          channel,
          `Sorry, @${tags.username}, you are not authorized to perform this action.`
        );
      }
    }
  } else if (
    (tags.mod ||
      tags.username === "tighwin" ||
      tags.username?.toLowerCase() === "everythingnowshow") &&
    message.toLowerCase() === "!activate"
  ) {
    isActive = true;
    client.say(channel, "Thank you for activating the bot!");
  } else {
    console.log("Bot is deactivated");
  }
});

client.on("subscription", async (channel, username) => {
  if (isActive && username.toLowerCase() !== "ananonymousgifter") {
    sendMessage(channel, "SUBSCRIPTION", { username });
    await addSubscriber(username);
  }
});

// Updated subgift event
client.on("subgift", async (channel, username, streakMonths, recipient) => {
  if (isActive && username.toLowerCase() !== "ananonymousgifter") {
    if (!thankedSubgifters.has(username)) {
      sendMessage(channel, "SUBGIFT", { username, recipient });
      thankedSubgifters.add(username);
      await addSubscriber(username);
      setTimeout(resetThankedSubgifters, subgiftResetTime);
    }
  }
});

// Handle resub
client.on(
  "resub",
  async (channel, username, streakMonths, msg, tags, methods) => {
    if (isActive && username.toLowerCase() !== "ananonymousgifter") {
      sendMessage(channel, "SUBSCRIPTION", { username });
      await addSubscriber(username);
    }
  }
);

// Handle primepaidupgrade
client.on("primepaidupgrade", async (channel, username, methods, tags) => {
  if (isActive && username.toLowerCase() !== "ananonymousgifter") {
    sendMessage(channel, "SUBSCRIPTION", { username });
    await addSubscriber(username);
  }
});

// Handle giftpaidupgrade
client.on("giftpaidupgrade", async (channel, username, methods, tags) => {
  if (isActive && username.toLowerCase() !== "ananonymousgifter") {
    sendMessage(channel, "SUBSCRIPTION", { username });
    await addSubscriber(username);
  }
});

// Handle anongiftpaidupgrade
client.on("anongiftpaidupgrade", async (channel, username) => {
  if (isActive && username.toLowerCase() !== "ananonymousgifter") {
    sendMessage(channel, "SUBSCRIPTION", { username });
    await addSubscriber(username);
  }
});

const lastReminderTimes: { [username: string]: number } = {};

// Every 25 minutes, remind the users with subscriptions to submit
setInterval(async () => {
  if (isActive) {
    // Skip reminder for PARTYQUEST format
    if (messageFormat === "PARTYQUEST" || !Messages[messageFormat]) {
      return;
    }

    // Exclude Patreon subscribers from reminders
    const { data: subscriberData, error: subscriberError } = await supabase
      .from("subscribers")
      .select("username, from_patreon")
      .or("from_patreon.is.null,from_patreon.eq.false");

    if (subscriberError) {
      console.error("Error fetching subscribers:", subscriberError);
      return;
    }

    if (subscriberData.length === 0) {
      return;
    }

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const subscriberList = Array.from(
      new Set(
        subscriberData
          .map((subscriber: any) => subscriber.username)
          .filter((username: string) => {
            if (
              !lastReminderTimes[username] ||
              now - lastReminderTimes[username] > oneDay
            ) {
              lastReminderTimes[username] = now;
              return true;
            }
            return false;
          })
          .map((username: string) => `@${username}`)
      )
    ).join(" ");

    if (subscriberList.length > 0) {
      client.say(
        opts.channels[0],
        `Hey ${subscriberList}, just a reminder that you've earned an ${Messages[messageFormat].REMINDSUBMISSION}`
      );
    }
  }
}, 1500000);

function sendMessage(
  channel: string,
  category: Category,
  variables: { [key: string]: string }
) {
  let messageTemplate = Messages[messageFormat][category];
  for (const [key, value] of Object.entries(variables)) {
    messageTemplate = messageTemplate.toString().replace(`{${key}}`, value);
  }
  client.say(channel, messageTemplate.toString());
}
