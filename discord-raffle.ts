import { Client, GatewayIntentBits, Events, EmbedBuilder } from "discord.js";
import { config } from "dotenv";
import {
  getAllUsers,
  initializeRaffleDB,
  RaffleUser,
  drawWinner,
  addTickets,
  resetAllTickets,
  raffleEvents,
  getUserTickets,
} from "./raffle";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
config();

// Configure the Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize raffle database
initializeRaffleDB()
  .then(() => {
    console.log("🎲 Raffle database initialized successfully for Discord bot");
  })
  .catch((err) => {
    console.error("❌ Failed to initialize raffle database:", err);
    process.exit(1);
  });

// Get prefix from environment or use default
const PREFIX = "!raffle";

// Channel ID for raffle commands
const RAFFLE_CHANNEL_ID = "1140774753112703086";

// Discord ready event
client.once(Events.ClientReady, (c) => {
  console.log(`🤖 Discord bot ready! Logged in as ${c.user.tag}`);
  console.log("📊 Discord raffle commands:");
  console.log(`  ${PREFIX} check - Show current raffle entries`);
  console.log(`  ${PREFIX} wheel - Output a wheel format file`);
  console.log(`  ${PREFIX} wheel-example - Show an example wheel format`);
  console.log(`  ${PREFIX} draw - Draw a random winner`);
  console.log(`  ${PREFIX} give <username> <tickets> - Give tickets to a user`);
  console.log(`  ${PREFIX} reset - Reset all raffle tickets`);
  console.log(`  ${PREFIX} help - Show all commands`);
  console.log(`🎯 Raffle commands restricted to channel: ${RAFFLE_CHANNEL_ID}`);
  console.log(
    "ℹ️ Ticket collection is handled by the main Twitch bot (bot.ts); this bot reads the shared raffle database."
  );
});

// Event handlers for raffle events (fired by commands run through this bot)
raffleEvents.on("ticketsAdded", (data) => {
  console.log(`➕ Tickets added: ${data.count} to ${data.username}`);
});

raffleEvents.on("winnerDrawn", (winner) => {
  console.log(
    `🏆 Winner drawn: ${winner.username} with ${winner.tickets} tickets remaining`
  );
  // Send to Discord channel
  sendDiscordNotification(
    `🏆 **${winner.username}** won the raffle! They have **${
      winner.tickets
    } ticket${winner.tickets !== 1 ? "s" : ""}** remaining.`
  );
});

raffleEvents.on("ticketsReset", () => {
  console.log("🔄 All tickets have been reset");
  // Send to Discord channel
  sendDiscordNotification("🔄 All raffle tickets have been reset!");
});

// Function to send notifications to Discord channel
async function sendDiscordNotification(message: string) {
  try {
    const channel = client.channels.cache.get(RAFFLE_CHANNEL_ID);
    if (channel && channel.isTextBased() && "send" in channel) {
      await (channel as any).send(message);
    }
  } catch (error) {
    console.error("Error sending Discord notification:", error);
  }
}

// Process Discord messages
client.on(Events.MessageCreate, async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check if message starts with the prefix
  if (!message.content.startsWith(PREFIX)) return;

  console.log(
    `📨 Command received: "${message.content}" in channel: ${message.channel.id}`
  );

  // Get the command and arguments
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  console.log(
    `🔧 Processing command: "${command}" with args: [${args.join(", ")}]`
  );

  // Handle commands
  try {
    if (command === "check") {
      await handleCheckCommand(message);
    } else if (command === "wheel") {
      await handleWheelCommand(message);
    } else if (command === "wheel-example") {
      await handleWheelExampleCommand(message);
    } else if (command === "wheel-customize") {
      await handleWheelCustomizeCommand(message, args);
    } else if (command === "help") {
      await handleHelpCommand(message);
    } else if (command === "draw") {
      await handleDrawCommand(message);
    } else if (command === "give") {
      await handleGiveCommand(message, args);
    } else if (command === "reset") {
      await handleResetCommand(message);
    }
  } catch (error) {
    console.error("Error handling Discord command:", error);
    message.reply(
      "An error occurred while processing your command. Please try again later."
    );
  }
});

// Handle the check command to display current raffle entries
async function handleCheckCommand(message: any) {
  // Check if message is in the correct channel
  if (message.channel.id !== RAFFLE_CHANNEL_ID) {
    return message.reply(
      "This command can only be used in the designated raffle channel."
    );
  }

  console.log(`🔍 Check command triggered in channel: ${message.channel.id}`);

  const allUsers = await getAllUsers();
  console.log(`📊 Found ${allUsers.length} users in raffle database`);

  if (allUsers.length === 0) {
    return message.reply("There are no raffle entries yet.");
  }

  // Create a rich embed for displaying users
  const embed = new EmbedBuilder()
    .setTitle("🎫 Raffle Entries")
    .setColor(0x3498db)
    .setDescription(`Total participants: ${allUsers.length}`)
    .setTimestamp();

  // Add users to the embed, handling Discord's field limits
  let fields = [];

  // Create chunks of users
  const chunkSize = 15; // Adjust based on how many entries you want per field
  for (let i = 0; i < allUsers.length; i += chunkSize) {
    const chunk = allUsers.slice(i, i + chunkSize);
    const fieldContent = chunk
      .map(
        (user, index) =>
          `${i + index + 1}. **${user.username}**: ${user.tickets} ticket${
            user.tickets !== 1 ? "s" : ""
          }`
      )
      .join("\n");

    fields.push({
      name: `Entries ${i + 1}-${Math.min(i + chunkSize, allUsers.length)}`,
      value: fieldContent,
      inline: false,
    });
  }

  // Add total tickets count
  const totalTickets = allUsers.reduce((sum, user) => sum + user.tickets, 0);

  // Add fields to embed (respecting the 25 field limit)
  fields.slice(0, 25).forEach((field) => {
    embed.addFields(field);
  });

  // Add footer with total ticket count
  embed.setFooter({ text: `Total tickets in the raffle: ${totalTickets}` });

  // Send the embed
  await message.reply({ embeds: [embed] });

  // If there are more than 25 chunks, we need to send additional embeds
  if (fields.length > 25) {
    for (let i = 25; i < fields.length; i += 25) {
      const additionalEmbed = new EmbedBuilder()
        .setTitle("🎫 Raffle Entries (Continued)")
        .setColor(0x3498db);

      fields.slice(i, i + 25).forEach((field) => {
        additionalEmbed.addFields(field);
      });

      await message.channel.send({ embeds: [additionalEmbed] });
    }
  }
}

// Handle the wheel command to generate a wheel format file
async function handleWheelCommand(message: any) {
  const allUsers = await getAllUsers();

  if (allUsers.length === 0) {
    return message.reply("There are no raffle entries to create a wheel from.");
  }

  // Filter out users with 0 tickets
  const validUsers = allUsers.filter((user) => user.tickets > 0);

  if (validUsers.length === 0) {
    return message.reply(
      "There are no users with tickets to create a wheel from. All users have 0 tickets."
    );
  }

  // Log how many users were filtered out
  console.log(
    `Creating wheel with ${validUsers.length} valid users (filtered out ${
      allUsers.length - validUsers.length
    } users with 0 tickets)`
  );

  // Create wheel format with weighted entries
  const wheelData = createWheelFormat(validUsers);

  // Create a temporary file with the wheel data
  const tempDir = path.resolve(__dirname, "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const wheelFilePath = path.join(tempDir, "raffle-wheel.wheel");
  fs.writeFileSync(wheelFilePath, JSON.stringify(wheelData));

  // Send the file as an attachment
  await message.reply({
    content: `Here is your wheel file for the raffle with ${
      validUsers.length
    } participants. You can import this into a wheel spinner tool.${
      allUsers.length !== validUsers.length
        ? ` (Note: ${
            allUsers.length - validUsers.length
          } users with 0 tickets were excluded)`
        : ""
    }`,
    files: [wheelFilePath],
  });

  // Delete the temporary file after sending
  setTimeout(() => {
    try {
      fs.unlinkSync(wheelFilePath);
    } catch (err) {
      console.error("Error deleting temporary wheel file:", err);
    }
  }, 5000);
}

// Handle the wheel-example command
async function handleWheelExampleCommand(message: any) {
  // Example wheel format matching the template
  const exampleWheelData = {
    afterSpinSound: "no-sound",
    afterSpinSoundVolume: 0,
    allowDuplicates: true,
    animateWinner: false,
    autoRemoveWinner: false,
    centerText: "",
    colorSettings: [
      { color: "#3369E8", enabled: true },
      { color: "#D50F25", enabled: true },
      { color: "#EEB211", enabled: true },
      { color: "#D55925", enabled: true },
      { color: "#000000", enabled: false },
      { color: "#000000", enabled: false },
    ],
    coverImageName: "",
    coverImageType: "",
    customCoverImageDataUri: "",
    customPictureDataUri: "",
    customPictureName: "",
    description: "",
    displayHideButton: true,
    displayRemoveButton: true,
    displayWinnerDialog: true,
    drawOutlines: false,
    drawShadow: true,
    duringSpinSound: "ticking-sound",
    duringSpinSoundVolume: 50,
    entries: [
      { text: "Username 1", weight: 5, enabled: true },
      { text: "Username 2", weight: 1, enabled: true },
      { text: "Username 3", weight: 1, enabled: true },
      { text: "Username 4", weight: 1, enabled: true, color: "#f50000" },
    ],
    galleryPicture: "/images/none.png",
    hubSize: "S",
    isAdvanced: true,
    launchConfetti: false,
    maxNames: 1000,
    pageBackgroundColor: "#33ff33",
    pictureType: "none",
    playClickWhenWinnerRemoved: false,
    showTitle: false,
    slowSpin: false,
    spinTime: 10,
    title: "Subscriber Names",
    type: "color",
    winnerMessage: "",
  };

  // Create a temporary file with the example wheel data
  const tempDir = path.resolve(__dirname, "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const exampleFilePath = path.join(tempDir, "example-wheel.wheel");
  fs.writeFileSync(exampleFilePath, JSON.stringify(exampleWheelData));

  // Send the file as an attachment with explanatory message
  await message.reply({
    content:
      "Here is an example wheel file. This shows the format used for wheel spinner tools.",
    files: [exampleFilePath],
  });

  // Delete the temporary file after sending
  setTimeout(() => {
    try {
      fs.unlinkSync(exampleFilePath);
    } catch (err) {
      console.error("Error deleting temporary example wheel file:", err);
    }
  }, 5000);
}

// Handle the help command
async function handleHelpCommand(message: any) {
  const embed = new EmbedBuilder()
    .setTitle("🎮 Raffle Bot Commands")
    .setColor(0x3498db)
    .setDescription("Here are the available raffle commands:")
    .addFields(
      {
        name: `${PREFIX} check`,
        value: "Display all current raffle entries with their ticket counts",
        inline: false,
      },
      {
        name: `${PREFIX} wheel`,
        value: "Generate a wheel format file from current raffle entries",
        inline: false,
      },
      {
        name: `${PREFIX} wheel-example`,
        value: "Show an example wheel format file",
        inline: false,
      },
      {
        name: `${PREFIX} wheel-customize`,
        value:
          "Customize the wheel appearance (background, title, etc.)\nUse `!raffle wheel-customize` for options",
        inline: false,
      },
      {
        name: `${PREFIX} draw`,
        value:
          "Draw a random winner from the raffle (removes 1 ticket from winner)",
        inline: false,
      },
      {
        name: `${PREFIX} give <username> <tickets>`,
        value: "Give tickets to a specific user",
        inline: false,
      },
      {
        name: `${PREFIX} reset`,
        value: "Reset all raffle tickets (moderator only)",
        inline: false,
      },
      {
        name: `${PREFIX} help`,
        value: "Display this help message",
        inline: false,
      }
    )
    .setFooter({
      text: "Raffle entries are automatically collected from Twitch subscriptions and gift subs",
    });

  await message.reply({ embeds: [embed] });
}

// Handle the draw command to draw a random winner
async function handleDrawCommand(message: any) {
  console.log(`🎲 Draw command triggered in channel: ${message.channel.id}`);

  // Check if message is in the correct channel
  if (message.channel.id !== RAFFLE_CHANNEL_ID) {
    console.log(
      `❌ Wrong channel. Expected: ${RAFFLE_CHANNEL_ID}, Got: ${message.channel.id}`
    );
    return message.reply(
      "This command can only be used in the designated raffle channel."
    );
  }

  try {
    const winner = await drawWinner(true);
    if (winner) {
      const embed = new EmbedBuilder()
        .setTitle("🎉 Raffle Winner!")
        .setColor(0x00ff00)
        .setDescription(`Congratulations **${winner.username}**!`)
        .addFields({
          name: "Tickets Remaining",
          value: `${winner.tickets} ticket${winner.tickets !== 1 ? "s" : ""}`,
          inline: true,
        })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } else {
      await message.reply("No raffle entries available to draw from!");
    }
  } catch (error) {
    console.error("Error drawing winner:", error);
    await message.reply(
      "An error occurred while drawing the winner. Please try again."
    );
  }
}

// Handle the give command to give tickets to a user
async function handleGiveCommand(message: any, args: string[]) {
  console.log(`🎫 Give command triggered in channel: ${message.channel.id}`);

  // Check if message is in the correct channel
  if (message.channel.id !== RAFFLE_CHANNEL_ID) {
    console.log(
      `❌ Wrong channel. Expected: ${RAFFLE_CHANNEL_ID}, Got: ${message.channel.id}`
    );
    return message.reply(
      "This command can only be used in the designated raffle channel."
    );
  }

  // Check if user has permission (moderator or specific roles)
  if (!message.member?.permissions.has("ManageMessages")) {
    return message.reply("You don't have permission to use this command.");
  }

  // Check if correct number of arguments
  if (args.length !== 2) {
    return message.reply("Usage: `!raffle give <username> <tickets>`");
  }

  const username = args[0];
  const ticketCount = parseInt(args[1]);

  // Validate ticket count
  if (isNaN(ticketCount) || ticketCount <= 0) {
    return message.reply(
      "Please provide a valid number of tickets (greater than 0)."
    );
  }

  try {
    await addTickets(username, ticketCount);

    const embed = new EmbedBuilder()
      .setTitle("🎫 Tickets Added")
      .setColor(0x3498db)
      .setDescription(
        `Added **${ticketCount} ticket${
          ticketCount !== 1 ? "s" : ""
        }** to **${username}**`
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error adding tickets:", error);
    await message.reply(
      "An error occurred while adding tickets. Please try again."
    );
  }
}

// Handle the reset command to clear all raffle tickets
async function handleResetCommand(message: any) {
  console.log(`🔄 Reset command triggered in channel: ${message.channel.id}`);

  // Check if message is in the correct channel
  if (message.channel.id !== RAFFLE_CHANNEL_ID) {
    console.log(
      `❌ Wrong channel. Expected: ${RAFFLE_CHANNEL_ID}, Got: ${message.channel.id}`
    );
    return message.reply(
      "This command can only be used in the designated raffle channel."
    );
  }

  // Check if user has permission (moderator or specific roles)
  if (!message.member?.permissions.has("ManageMessages")) {
    return message.reply("You don't have permission to use this command.");
  }

  try {
    // Get current user count before reset
    const allUsers = await getAllUsers();
    const totalTickets = allUsers.reduce((sum, user) => sum + user.tickets, 0);

    // Reset all tickets
    await resetAllTickets();

    const embed = new EmbedBuilder()
      .setTitle("🔄 Raffle Reset")
      .setColor(0xff6b6b)
      .setDescription("All raffle tickets have been reset!")
      .addFields(
        {
          name: "Previous Participants",
          value: `${allUsers.length} users`,
          inline: true,
        },
        {
          name: "Previous Tickets",
          value: `${totalTickets} tickets`,
          inline: true,
        }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error("Error resetting raffle:", error);
    await message.reply(
      "An error occurred while resetting the raffle. Please try again."
    );
  }
}

// Create wheel format from raffle users
function createWheelFormat(users: RaffleUser[]) {
  // Filter out users with 0 tickets to prevent breaking the wheel spinner
  const validUsers = users.filter((user) => user.tickets > 0);

  // Create entries with proper weighting using the weight property
  const entries = validUsers.map((user) => ({
    text: user.username,
    weight: user.tickets,
    enabled: true,
  }));

  // Create the wheel data structure following the example template
  return {
    afterSpinSound: "no-sound",
    afterSpinSoundVolume: 0,
    allowDuplicates: true,
    animateWinner: false,
    autoRemoveWinner: false,
    centerText: "",
    colorSettings: [
      { color: "#3369E8", enabled: true },
      { color: "#D50F25", enabled: true },
      { color: "#EEB211", enabled: true },
      { color: "#D55925", enabled: true },
      { color: "#000000", enabled: false },
      { color: "#000000", enabled: false },
    ],
    coverImageName: "",
    coverImageType: "",
    customCoverImageDataUri: "",
    customPictureDataUri: "",
    customPictureName: "",
    description: "",
    displayHideButton: true,
    displayRemoveButton: true,
    displayWinnerDialog: true,
    drawOutlines: false,
    drawShadow: true,
    duringSpinSound: "ticking-sound",
    duringSpinSoundVolume: 50,
    entries: entries,
    galleryPicture: "/images/none.png",
    hubSize: "S",
    isAdvanced: true,
    launchConfetti: false,
    maxNames: 1000,
    pageBackgroundColor: "#33FF33",
    pictureType: "none",
    playClickWhenWinnerRemoved: false,
    showTitle: false,
    slowSpin: false,
    spinTime: 10,
    title: "Raffle Wheel",
    type: "color",
    winnerMessage: "",
  };
}

// Handle wheel customization command
async function handleWheelCustomizeCommand(message: any, args: string[]) {
  if (args.length === 0) {
    return message.reply(`
Usage examples:
\`${PREFIX} wheel-customize title "My Custom Wheel"\` - Set wheel title
\`${PREFIX} wheel-customize sound on\` - Enable winning sound
\`${PREFIX} wheel-customize confetti on\` - Enable confetti
\`${PREFIX} wheel-customize spintime 15\` - Set spin time to 15 seconds

Note: Background color is always set to green (#33FF33) for chroma keying purposes.
    `);
  }

  const allUsers = await getAllUsers();
  if (allUsers.length === 0) {
    return message.reply("There are no raffle entries to create a wheel from.");
  }

  // Filter out users with 0 tickets
  const validUsers = allUsers.filter((user) => user.tickets > 0);

  if (validUsers.length === 0) {
    return message.reply(
      "There are no users with tickets to create a wheel from. All users have 0 tickets."
    );
  }

  // Log how many users were filtered out
  console.log(
    `Creating customized wheel with ${
      validUsers.length
    } valid users (filtered out ${
      allUsers.length - validUsers.length
    } users with 0 tickets)`
  );

  // Create the base wheel data
  const wheelData = createWheelFormat(validUsers);

  // Apply customizations
  const setting = args[0].toLowerCase();
  const value = args.slice(1).join(" ");

  if (setting === "background" || setting === "bg") {
    // Prevent changing the background color
    message.reply(
      "Background color cannot be changed as it is fixed to green (#33FF33) for chroma keying purposes."
    );
    return;
  } else if (setting === "title") {
    // Set wheel title
    wheelData.title = value;
    wheelData.showTitle = value.length > 0;
    message.reply(`Wheel title set to "${value}"`);
  } else if (setting === "sound") {
    // Toggle sound
    if (value.toLowerCase() === "on") {
      wheelData.afterSpinSound = "applause-sound-soft";
      wheelData.afterSpinSoundVolume = 50;
      message.reply("Wheel winning sound enabled");
    } else if (value.toLowerCase() === "off") {
      wheelData.afterSpinSound = "no-sound";
      wheelData.afterSpinSoundVolume = 0;
      message.reply("Wheel winning sound disabled");
    } else {
      message.reply("Please specify 'on' or 'off'");
      return;
    }
  } else if (setting === "confetti") {
    // Toggle confetti
    if (value.toLowerCase() === "on") {
      wheelData.launchConfetti = true;
      message.reply("Wheel confetti enabled");
    } else if (value.toLowerCase() === "off") {
      wheelData.launchConfetti = false;
      message.reply("Wheel confetti disabled");
    } else {
      message.reply("Please specify 'on' or 'off'");
      return;
    }
  } else if (setting === "spintime") {
    // Set spin time
    const spinTime = parseInt(value);
    if (!isNaN(spinTime) && spinTime > 0 && spinTime <= 30) {
      wheelData.spinTime = spinTime;
      message.reply(`Wheel spin time set to ${spinTime} seconds`);
    } else {
      message.reply(
        "Please provide a valid spin time between 1 and 30 seconds"
      );
      return;
    }
  } else {
    message.reply(
      `Unknown setting: ${setting}. Use \`${PREFIX} wheel-customize\` without arguments to see available options.`
    );
    return;
  }

  // Ensure the background always stays green for chroma keying
  wheelData.pageBackgroundColor = "#33FF33";

  // Create a temporary file with the wheel data
  const tempDir = path.resolve(__dirname, "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const wheelFilePath = path.join(tempDir, "custom-wheel.wheel");
  fs.writeFileSync(wheelFilePath, JSON.stringify(wheelData));

  // Send the file as an attachment
  await message.reply({
    content: `Here is your customized wheel file with ${
      validUsers.length
    } participants:${
      allUsers.length !== validUsers.length
        ? ` (Note: ${
            allUsers.length - validUsers.length
          } users with 0 tickets were excluded)`
        : ""
    }`,
    files: [wheelFilePath],
  });

  // Delete the temporary file after sending
  setTimeout(() => {
    try {
      fs.unlinkSync(wheelFilePath);
    } catch (err) {
      console.error("Error deleting temporary wheel file:", err);
    }
  }, 5000);
}

// Login to Discord with your client token
client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
  console.error("Failed to login to Discord:", error);
  process.exit(1);
});

// Add connection status logging
client.on(Events.ClientReady, () => {
  console.log("✅ Discord client is ready and connected");
  console.log(`🎯 Target raffle channel ID: ${RAFFLE_CHANNEL_ID}`);

  // Check if we can access the target channel
  const targetChannel = client.channels.cache.get(RAFFLE_CHANNEL_ID);
  if (targetChannel) {
    console.log(`✅ Found target channel: ${targetChannel}`);
  } else {
    console.log(`❌ Could not find target channel: ${RAFFLE_CHANNEL_ID}`);
  }
});

// Handle process termination
process.on("SIGINT", async () => {
  console.log("\n👋 Shutting down Discord raffle bot...");
  client.destroy();
  console.log("✅ Shutdown complete");
  process.exit(0);
});
