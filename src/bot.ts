import { Client, GatewayIntentBits, TextChannel, ActivityType } from 'discord.js';
import { initConsoleHook } from './lib/console-hook';

// Initialize console hook for the gateway bot
if (process.env.DISCORD_CHANNEL_LOGS) {
  initConsoleHook();
}

const token = process.env.DISCORD_TOKEN;
const defaultChannelId = process.env.DISCORD_CHANNEL_DEFAULT;

if (!token) {
  console.error('❌ Error: DISCORD_TOKEN no está configurado en las variables de entorno.');
  process.exit(1);
}

console.log('🔄 Iniciando conexión con Discord Gateway...');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once('ready', async () => {
  console.log(`\n==================================================`);
  console.log(`✅ ¡Bot conectado con éxito a Discord como: ${client.user?.tag}!`);
  console.log(`🟢 Estado: En línea`);
  console.log(`==================================================\n`);

  // Set presence activity
  client.user?.setPresence({
    status: 'online',
    activities: [{
      name: 'GitHub Events',
      type: ActivityType.Watching
    }]
  });

  if (defaultChannelId) {
    try {
      const channel = await client.channels.fetch(defaultChannelId);
      if (channel && channel.isTextBased()) {
        await (channel as TextChannel).send(
          '🤖 **¡El bot de GitCord está activo, en línea y listo para reportar eventos de GitHub!**\n' +
          '🟢 *Conexión establecida con Discord Gateway.*'
        );
        console.log(`📢 Mensaje de inicio enviado con éxito al canal de texto: ${defaultChannelId}`);
      } else {
        console.warn(`⚠️ El canal ${defaultChannelId} no es un canal de texto basado en mensajes.`);
      }
    } catch (error) {
      console.error(`❌ Error al intentar enviar el mensaje de inicio al canal ${defaultChannelId}:`, error);
    }
  } else {
    console.log('ℹ️ DISCORD_CHANNEL_DEFAULT no está configurada, omitiendo mensaje de bienvenida.');
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔄 Desconectando bot de Discord...');
  client.destroy();
  process.exit(0);
});

client.login(token);
