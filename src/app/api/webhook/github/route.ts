import { NextRequest, NextResponse } from 'next/server';
import { formatWebhookEvent } from '@/lib/github';
import { sendToDiscord, addLog } from '@/lib/discord';

export async function POST(request: NextRequest) {
  const event = request.headers.get('x-github-event') || '';
  
  if (event === 'ping') {
    addLog({
      eventType: 'ping',
      repository: 'N/A',
      sender: 'GitHub System',
      description: 'Webhook successfully connected (ping event)',
      status: 'success',
      details: 'Ping connection successful.'
    });
    return NextResponse.json({ message: 'pong' }, { status: 200 });
  }

  try {
    const body = await request.json();
    
    // Parse the event
    const parsed = formatWebhookEvent(event, body);
    
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
      return NextResponse.json({ success: false, error: discordResult.error }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Webhook processing error:', error);
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
