import discord
from discord.ext import commands
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Your bot token (securely loaded from .env file)
BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')
# The ID of the channel where you want to create the thread
CHANNEL_ID = 565093774125039634

intents = discord.Intents.default()
intents.messages = True

bot = commands.Bot(command_prefix='!', intents=intents)

@bot.event
async def on_ready():
    print(f'Logged in as {bot.user}!')

    # Get the current date in a specific format (e.g., YYYY-MM-DD)
    date = datetime.now()
    date_today_raw = date - timedelta(days=1)
    date_today = date_today_raw.strftime('%Y-%m-%d')
    thread_name = f"Stream Thread {date_today}"

    # Fetch the channel
    channel = bot.get_channel(CHANNEL_ID)
    if channel:
        # Create a public thread with the date as its name
        # Note: You can adjust `auto_archive_duration` and `type` if needed
        thread = await channel.create_thread(name=thread_name, auto_archive_duration=1440, type=discord.ChannelType.public_thread)
        print(f"Created thread: {thread.name}")
        await bot.close()
    else:
        print("Channel not found.")
        await bot.close()

bot.run(BOT_TOKEN)
