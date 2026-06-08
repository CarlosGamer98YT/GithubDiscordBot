import { Client, GatewayIntentBits, TextChannel, ActivityType, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { initConsoleHook } from './lib/console-hook';
import { setGuildLanguage, saveChannelGuildMap } from './lib/i18n';

// Initialize console hook for the gateway bot
if (process.env.DISCORD_CHANNEL_LOGS) {
  initConsoleHook();
}

const token = process.env.DISCORD_TOKEN;
const defaultChannelId = process.env.DISCORD_CHANNEL_DEFAULT;

if (!token) {
  console.error('❌ Error: DISCORD_TOKEN is not configured in the environment variables.');
  process.exit(1);
}

console.log('🔄 Initiating connection to Discord Gateway...');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once('ready', async () => {
  console.log(`\n==================================================`);
  console.log(`✅ Bot successfully connected to Discord as: ${client.user?.tag}!`);
  console.log(`🟢 Status: Online`);
  console.log(`==================================================\n`);

  // Set presence activity
  client.user?.setPresence({
    status: 'online',
    activities: [{
      name: 'GitHub Events',
      type: ActivityType.Watching
    }]
  });

  // Register Slash Commands (/language and /ping)
  try {
    console.log('🔄 Registering /language and /ping commands with Discord API...');
    const commands = [
      new SlashCommandBuilder()
        .setName('language')
        .setDescription('Configure the bot notification language / Configura el idioma de las notificaciones')
        .addStringOption(option =>
          option.setName('lang')
            .setDescription('Select language / Selecciona el idioma')
            .setRequired(true)
            .addChoices(
              { name: 'English', value: 'en' },
              { name: 'Español', value: 'es' }
            )
        ),
      new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong! / Responde con Pong!')
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    
    // Register globally (takes up to an hour to propagate)
    await rest.put(
      Routes.applicationCommands(client.user!.id),
      { body: commands }
    );
    console.log('✅ Global slash commands successfully registered.');

    // Register specifically for all guilds the bot is currently in (instant update!)
    const guilds = await client.guilds.fetch();
    const channelGuildMap: Record<string, string> = {};
    for (const [guildId, guild] of guilds) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(client.user!.id, guildId),
          { body: commands }
        );
        console.log(`✅ Guild slash commands registered instantly for guild: ${guild.name || guildId}`);
        
        // Fetch all channels in the guild to map them for webhook processing
        const fullGuild = await guild.fetch();
        const channels = await fullGuild.channels.fetch();
        for (const [channelId, channel] of channels) {
          if (channel) {
            channelGuildMap[channelId] = guildId;
          }
        }
      } catch (err: any) {
        console.warn(`⚠️ Warning: Failed to register commands or cache channels for guild ${guildId}:`, err.message || err);
      }
    }

    // Save channel guild map cache
    if (Object.keys(channelGuildMap).length > 0) {
      try {
        await saveChannelGuildMap(channelGuildMap);
        console.log(`✅ Cached ${Object.keys(channelGuildMap).length} channel-to-guild mappings.`);
      } catch (err: any) {
        console.error('❌ Failed to save channel-to-guild map cache:', err.message || err);
      }
    }
  } catch (err) {
    console.error('❌ Error registering slash commands:', err);
  }

  // Greeting message in default channel
  if (defaultChannelId) {
    try {
      const channel = await client.channels.fetch(defaultChannelId);
      if (channel && channel.isTextBased()) {
        await (channel as TextChannel).send(
          '🤖 **GitCord Bot is active, online, and ready to report GitHub events!**\n' +
          '🟢 *Connection established with Discord Gateway.* (Use `/language` to configure your language)'
        );
        console.log(`📢 Startup message successfully sent to text channel: ${defaultChannelId}`);
      } else {
        console.warn(`⚠️ Channel ${defaultChannelId} is not a valid text-based channel.`);
      }
    } catch (error) {
      console.error(`❌ Error trying to send startup message to channel ${defaultChannelId}:`, error);
    }
  } else {
    console.log('ℹ️ DISCORD_CHANNEL_DEFAULT is not configured, skipping greeting message.');
  }

  // Background Auto-Sync loop (if GITHUB_USERNAME is configured)
  const githubUsername = process.env.GITHUB_USERNAME;
  if (githubUsername) {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    // Polling interval in minutes, default 5 minutes
    const intervalMinutes = parseInt(process.env.POLLING_INTERVAL || '5', 10);
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`⏱️ [Auto-Sync] Initializing background syncing for @${githubUsername} every ${intervalMinutes} minute(s)...`);
    console.log(`⏱️ [Auto-Sync] Target Dashboard URL: ${appUrl}`);

    const runAutoSync = async () => {
      console.log(`🔄 [Auto-Sync] Triggering user activity synchronization...`);
      try {
        const syncRes = await fetch(`${appUrl}/api/sync-user`, {
          method: 'POST',
        });
        if (syncRes.ok) {
          const data = await syncRes.json();
          if (data.success) {
            console.log(`✅ [Auto-Sync] Synchronization complete. Forwarded ${data.count} new events.`);
          } else {
            console.warn(`⚠️ [Auto-Sync] Synchronization reported failure: ${data.message || 'Unknown error'}`);
          }
        } else {
          console.warn(`⚠️ [Auto-Sync] Failed to sync. HTTP Status: ${syncRes.status}`);
        }
      } catch (err: any) {
        console.error(`❌ [Auto-Sync] Network error during synchronization:`, err.message || err);
      }
    };

    // Run once on startup (after 5 seconds to let server spin up/settle if running concurrently)
    setTimeout(() => {
      runAutoSync().catch(err => console.error(`❌ [Auto-Sync] Initial run error:`, err));
    }, 5000);

    const autoSyncInterval = setInterval(() => {
      runAutoSync().catch(err => console.error(`❌ [Auto-Sync] Interval run error:`, err));
    }, intervalMs);

    // Clean up interval on shutdown
    process.on('SIGINT', () => {
      clearInterval(autoSyncInterval);
    });
  } else {
    console.log('ℹ️ [Auto-Sync] GITHUB_USERNAME is not configured, background syncing disabled.');
  }
});

// Handle Slash Command Interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'language') {
    const lang = interaction.options.getString('lang') as 'en' | 'es';
    const guildId = interaction.guildId || 'global';

    try {
      await setGuildLanguage(guildId, lang);
      
      if (lang === 'es') {
        await interaction.reply({ 
          content: '✅ ¡Idioma cambiado a **Español** para este servidor de Discord!', 
          ephemeral: true 
        });
        console.log(`🌐 Language for guild ${guildId} changed to Spanish.`);
      } else {
        await interaction.reply({ 
          content: '✅ Language changed to **English** for this Discord server!', 
          ephemeral: true 
        });
        console.log(`🌐 Language for guild ${guildId} changed to English.`);
      }
    } catch (err) {
      console.error('❌ Error updating language:', err);
      await interaction.reply({ 
        content: '❌ Error: Failed to update language / No se pudo actualizar el idioma.', 
        ephemeral: true 
      });
    }
  }

  if (commandName === 'ping') {
    await interaction.reply({ content: '🏓 **Pong!**' });
    console.log('🏓 Ping-pong command executed.');
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔄 Disconnecting bot from Discord...');
  client.destroy();
  process.exit(0);
});

client.login(token);
