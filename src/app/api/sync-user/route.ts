import { NextRequest, NextResponse } from 'next/server';
import { formatPolledEvent } from '@/lib/github';
import { sendToDiscord, addLog } from '@/lib/discord';
import fs from 'fs';
import path from 'path';

// Define the temporary cache file path inside /tmp (serverless container storage)
const getCacheFilePath = (username: string) => path.join('/tmp', `github_last_event_${username}.json`);

export async function POST(request: NextRequest) {
  const username = process.env.GITHUB_USERNAME;
  const pat = process.env.GITHUB_PAT;

  if (!username) {
    return NextResponse.json({ 
      success: false, 
      message: 'GITHUB_USERNAME is not configured in your .env file.' 
    }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'NextJS-GitHub-Discord-Bot',
    };

    if (pat) {
      headers['Authorization'] = `Bearer ${pat}`;
    }

    const response = await fetch(`https://api.github.com/users/${username}/events`, {
      headers,
      next: { revalidate: 0 } // Disable fetch cache
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ 
        success: false, 
        message: `GitHub API error (${response.status}): ${errorText}` 
      }, { status: response.status });
    }

    const events = await response.json();
    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'No events found.' });
    }

    // Read last processed event ID from temporary cache
    const cacheFile = getCacheFilePath(username);
    let lastEventId: string | null = null;
    
    if (fs.existsSync(cacheFile)) {
      try {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        lastEventId = cacheData.lastEventId || null;
      } catch (e) {
        console.error('Failed to parse cache file:', e);
      }
    }

    let eventsToProcess: any[] = [];

    if (lastEventId) {
      // Find the index of the last processed event
      const lastEventIndex = events.findIndex(e => e.id === lastEventId);
      
      if (lastEventIndex > 0) {
        // Events index 0 to lastEventIndex - 1 are new (events are reverse chronological)
        eventsToProcess = events.slice(0, lastEventIndex);
      } else if (lastEventIndex === -1) {
        // Last event is no longer in the list (GitHub events are capped at 30 items),
        // fallback to processing only events in the last 5 minutes to avoid spam
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        eventsToProcess = events.filter(e => new Date(e.created_at) > fiveMinutesAgo);
      }
    } else {
      // First run: only process events from the last 5 minutes to avoid historical spam
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      eventsToProcess = events.filter(e => new Date(e.created_at) > fiveMinutesAgo);
    }

    // Process new events (from oldest to newest to post in chronological order)
    const processedEvents = [];
    eventsToProcess.reverse(); // Now index 0 is oldest new event

    for (const event of eventsToProcess) {
      const parsed = formatPolledEvent(event);
      if (!parsed) continue;

      const { message, description, repoName } = parsed;
      
      // Determine event type for mapping channels
      let eventType = 'watch'; // Default mapping
      if (event.type === 'ForkEvent') eventType = 'fork';
      if (event.type === 'PullRequestEvent') eventType = 'pull_request';

      const discordResult = await sendToDiscord(eventType, message);

      if (discordResult.success) {
        const log = addLog({
          eventType: `${eventType}-poll`,
          repository: repoName,
          sender: username,
          description: `Poller: user ${description}`,
          status: 'success',
          details: `Poller event processed. Discord Channel ID: ${discordResult.channelId}`
        });
        processedEvents.push(log);
      } else {
        const log = addLog({
          eventType: `${eventType}-poll`,
          repository: repoName,
          sender: username,
          description: `Poller: user ${description} (FAILED)`,
          status: 'error',
          details: `Poller failed to send to Discord. Error: ${discordResult.error}`
        });
        processedEvents.push(log);
      }
    }

    // Save the newest event ID to the cache
    const newestEventId = events[0].id;
    try {
      fs.writeFileSync(cacheFile, JSON.stringify({ lastEventId: newestEventId }), 'utf8');
    } catch (e) {
      console.error('Failed to write cache file:', e);
    }

    return NextResponse.json({ 
      success: true, 
      count: processedEvents.length, 
      events: processedEvents 
    });
  } catch (error: any) {
    console.error('GitHub polling error:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Unknown server error during sync' 
    }, { status: 500 });
  }
}
