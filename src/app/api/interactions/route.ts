import { NextRequest, NextResponse } from 'next/server';
import { verifyKey } from 'discord-interactions';
import { setGuildLanguage } from '@/lib/i18n';
import { logSystem } from '@/lib/console-hook';

export async function POST(request: NextRequest) {
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

        await setGuildLanguage(guildId, lang);
        
        await logSystem('log', `[Discord Interactions] Command /language received. Guild: ${guildId}, Set to: ${lang}`);

        const replyContent = lang === 'es'
          ? '✅ ¡Idioma cambiado a **Español** para este servidor de Discord!'
          : '✅ Language changed to **English** for this Discord server!';

        return NextResponse.json({
          type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
          data: {
            content: replyContent,
            flags: 64 // EPHEMERAL (Only visible to the user who ran the command)
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
