import { Client, GatewayIntentBits, TextChannel, ActivityType, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { initConsoleHook } from './lib/console-hook';
import { setGuildLanguage } from './lib/i18n';

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

  // Register Slash Commands (/language)
  try {
    console.log('🔄 Registering /language command with Discord API...');
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
        )
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(
      Routes.applicationCommands(client.user!.id),
      { body: commands }
    );
    console.log('✅ /language command successfully registered globally.');
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
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔄 Disconnecting bot from Discord...');
  client.destroy();
  process.exit(0);
});

client.login(token);
