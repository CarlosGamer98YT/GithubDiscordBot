import { NextRequest, NextResponse } from 'next/server';
import { verifyKey } from 'discord-interactions';
import { setGuildLanguage, updateChannelTopicLanguage } from '@/lib/i18n';
import { logSystem } from '@/lib/console-hook';
import { notifyDeploymentOnce } from '@/lib/discord';

export async function POST(request: NextRequest) {
  // Trigger deployment notification once
  await notifyDeploymentOnce();

  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    console.error('❌ DISCORD_PUBLIC_KEY is not configured in environment.');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Read headers required for verification
  const signature = request.headers.get('x-signature-ed25519') || '';
  const timestamp = request.headers.get('x-signature-timestamp') || '';
  
  // ed25519 verification requires raw string body
  const body = await request.text();

  const isValidRequest = await verifyKey(body, signature, timestamp, publicKey);

  if (!isValidRequest) {
    await logSystem('warn', '[Discord Interactions] Failed cryptographic verification request.');
    return new Response('Invalid request signature', { status: 401 });
  }

  try {
    const interaction = JSON.parse(body);

    // Type 1: PING (Discord uses this to verify the endpoint URL)
    if (interaction.type === 1) {
      return NextResponse.json({ type: 1 });
    }

    // Type 2: APPLICATION_COMMAND
    if (interaction.type === 2) {
      const { name, options } = interaction.data;

      if (name === 'language') {
        const lang = options[0].value as 'en' | 'es';
        const guildId = interaction.guild_id || 'global';
        const channelId = interaction.channel_id || '';

        await setGuildLanguage(guildId, lang);
        
        // Try to update channel topic as database-free persistent language storage
        let topicUpdated = false;
        if (channelId) {
          topicUpdated = await updateChannelTopicLanguage(channelId, lang);
        }
        
        await logSystem('log', `[Discord Interactions] Command /language received. Guild: ${guildId}, Channel: ${channelId}, Set to: ${lang}, Topic updated: ${topicUpdated}`);

        let replyContent = lang === 'es'
          ? '✅ ¡Idioma cambiado a **Español** para este servidor de Discord!'
          : '✅ Language changed to **English** for this Discord server!';

        if (!topicUpdated && channelId) {
          replyContent += lang === 'es'
            ? '\n⚠️ *Nota: No pude actualizar el tema del canal automáticamente (falta el permiso "Gestionar canales" al Bot). Agrega manualmente `[gitcord-lang: es]` al tema/descripción de este canal en Discord para guardarlo de forma permanente en Vercel.*'
            : '\n⚠️ *Note: I could not update the channel topic automatically (Bot is missing "Manage Channels" permission). Please manually add `[gitcord-lang: en]` to this channel\'s topic/description in Discord to make it persist on Vercel.*';
        }

        return NextResponse.json({
          type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
          data: {
            content: replyContent,
            flags: 64 // EPHEMERAL (Only visible to the user who ran the command)
          }
        });
      }

      if (name === 'ping') {
        await logSystem('log', '[Discord Interactions] Command /ping received.');
        return NextResponse.json({
          type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
          data: {
            content: '🏓 **Pong!**'
          }
        });
      }
    }

    return NextResponse.json({ type: 1 });
  } catch (error: any) {
    await logSystem('error', '[Discord Interactions] Error processing interaction:', error.message || error);
    return NextResponse.json({ error: 'Internal processing error' }, { status: 500 });
  }
}
