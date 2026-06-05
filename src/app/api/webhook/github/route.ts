import { NextRequest, NextResponse } from 'next/server';
import { formatWebhookEvent } from '@/lib/github';
import { sendToDiscord, addLog, EVENT_CHANNEL_MAP, notifyDeploymentOnce } from '@/lib/discord';
import { logSystem } from '@/lib/console-hook';
import { resolveGuildIdForChannel, getGuildLanguage } from '@/lib/i18n';

export async function POST(request: NextRequest) {
  // Trigger deployment notification once
  await notifyDeploymentOnce();
  const event = request.headers.get('x-github-event') || '';
  
  if (event === 'ping') {
    // Send "Pong!" to the default channel
    const discordResult = await sendToDiscord('ping', {
      content: '🏓 **Pong!** GitHub webhook connection established successfully.'
    });

    addLog({
      eventType: 'ping',
      repository: 'N/A',
      sender: 'GitHub System',
      description: 'Webhook successfully connected (ping event)',
      status: discordResult.success ? 'success' : 'error',
      details: discordResult.success 
        ? `Ping successful. Sent "Pong!" to Discord channel: ${discordResult.channelId}`
        : `Ping failed to send to Discord. Error: ${discordResult.error}`
    });
    await logSystem(discordResult.success ? 'log' : 'error', `[Webhook Ping] Webhook connection test processed. Status: ${discordResult.success ? 'SUCCESS' : 'FAILED'}`);
    return NextResponse.json({ message: 'pong' }, { status: 200 });
  }

  try {
    const body = await request.json();
    
    // Resolve channel, guild, and language settings for the event
    const envVarName = EVENT_CHANNEL_MAP[event] || 'DISCORD_CHANNEL_DEFAULT';
    const channelId = process.env[envVarName] || process.env.DISCORD_CHANNEL_DEFAULT || '';
    let lang: 'en' | 'es' = 'en';
    if (channelId) {
      const guildId = await resolveGuildIdForChannel(channelId);
      lang = await getGuildLanguage(guildId);
    }

    // Parse the event using target language
    const parsed = formatWebhookEvent(event, body, lang);
    
    if (!parsed) {
      // Log skipped/unhandled events
      const repo = body.repository?.full_name || 'unknown-repo';
      const sender = body.sender?.login || 'unknown-sender';
      
      addLog({
        eventType: event || 'unknown',
        repository: repo,
        sender,
        description: `Skipped unhandled event: "${event}"`,
        status: 'success',
        details: 'This event type is not configured or ignored.'
      });
      return NextResponse.json({ message: `Event '${event}' skipped (unhandled)` }, { status: 200 });
    }

    const { message, description, repoName, senderName } = parsed;

    // Send to Discord
    const discordResult = await sendToDiscord(event, message);

    if (discordResult.success) {
      addLog({
        eventType: event,
        repository: repoName,
        sender: senderName,
        description,
        status: 'success',
        details: `Successfully forwarded to Discord channel ID: ${discordResult.channelId}`
      });
      await logSystem('log', `[Webhook] Successfully forwarded "${event}" event for ${repoName} to Discord`);
      return NextResponse.json({ success: true, message: 'Notification sent' }, { status: 200 });
    } else {
      addLog({
        eventType: event,
        repository: repoName,
        sender: senderName,
        description,
        status: 'error',
        details: `Failed to send to Discord (Channel ID: ${discordResult.channelId || 'none'}). Error: ${discordResult.error}`
      });
      await logSystem('error', `[Webhook] Failed to forward "${event}" event for ${repoName}. Error: ${discordResult.error}`);
      return NextResponse.json({ success: false, error: discordResult.error }, { status: 500 });
    }
  } catch (error: any) {
    await logSystem('error', 'Webhook processing error:', error.message || error);
    addLog({
      eventType: event || 'error',
      repository: 'Error',
      sender: 'System',
      description: 'Error processing webhook payload',
      status: 'error',
      details: error.message || 'Malformed JSON or system error'
    });
    return NextResponse.json({ error: 'Failed to process webhook', details: error.message }, { status: 400 });
  }
}
