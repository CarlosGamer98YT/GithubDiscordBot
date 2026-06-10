import { NextRequest, NextResponse } from 'next/server';
import { formatPolledEvent } from '@/lib/github';
import { sendToDiscord, addLog, EVENT_CHANNEL_MAP } from '@/lib/discord';
import { logSystem } from '@/lib/console-hook';
import { resolveGuildIdForChannel, getLanguageForChannel } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import fs from 'fs';
import path from 'path';

// Define the temporary cache file path (serverless container storage on Vercel, local project dir elsewhere)
const getCacheFilePath = (username: string, suffix: string = '') => {
  const filename = suffix ? `github_${suffix}_${username}.json` : `github_last_event_${username}.json`;
  if (process.env.VERCEL) {
    return path.join('/tmp', filename);
  }
  return path.join(process.cwd(), filename);
};

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
        // fallback to processing only events in the last 3 hours to avoid spam
        const threeHoursAgo = new Date(Date.now() - 180 * 60 * 1000);
        eventsToProcess = events.filter(e => new Date(e.created_at) > threeHoursAgo);
      }
    } else {
      // First run: only process events from the last 3 hours to avoid historical spam
      const threeHoursAgo = new Date(Date.now() - 180 * 60 * 1000);
      eventsToProcess = events.filter(e => new Date(e.created_at) > threeHoursAgo);
    }

    // Process new events (from oldest to newest to post in chronological order)
    const processedEvents = [];
    eventsToProcess.reverse(); // Now index 0 is oldest new event

    for (const event of eventsToProcess) {
      let eventType = 'watch'; // Default mapping
      if (event.type === 'ForkEvent') eventType = 'fork';
      if (event.type === 'PullRequestEvent') eventType = 'pull_request';
      if (event.type === 'PushEvent') eventType = 'push';
      if (event.type === 'CreateEvent' && (event.payload?.ref_type === 'repository' || (event.payload?.ref_type === 'branch' && event.payload?.ref === event.payload?.master_branch))) eventType = 'repository_create';
      // Note: DeleteEvent with ref_type=repository is never emitted by GitHub Events API.
      // Repo deletions are detected via repo list comparison below.

      // Resolve language settings for the event channel
      const envVarName = EVENT_CHANNEL_MAP[eventType] || 'DISCORD_CHANNEL_DEFAULT';
      const channelId = process.env[envVarName] || process.env.DISCORD_CHANNEL_DEFAULT || '';
      const lang = await getLanguageForChannel(channelId, eventType);

      const parsed = await formatPolledEvent(event, lang, headers);
      if (!parsed) continue;

      const { message, description, repoName } = parsed;

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

    // --- Detect deleted repositories via repo list comparison ---
    // GitHub's Events API never emits DeleteEvent with ref_type=repository,
    // so we compare the current repo list with a cached snapshot to detect deletions.
    const reposCacheFile = getCacheFilePath(username, 'repos');
    let deletedRepos: string[] = [];

    try {
      // Fetch all repos for the authenticated user (handles pagination up to 100)
      const reposRes = await fetch(`https://api.github.com/user/repos?per_page=100&sort=full_name&affiliation=owner`, {
        headers,
        next: { revalidate: 0 }
      });

      if (reposRes.ok) {
        const repos = await reposRes.json();
        const currentRepoNames: string[] = Array.isArray(repos) 
          ? repos.map((r: any) => r.full_name) 
          : [];

        // Load previous repo list from cache
        if (fs.existsSync(reposCacheFile)) {
          try {
            const cachedData = JSON.parse(fs.readFileSync(reposCacheFile, 'utf8'));
            const previousRepoNames: string[] = cachedData.repos || [];

            // Repos that were in the previous list but not in the current one = deleted
            deletedRepos = previousRepoNames.filter(name => !currentRepoNames.includes(name));
          } catch (e) {
            console.error('Failed to parse repos cache file:', e);
          }
        }

        // Save current repo list to cache
        try {
          fs.writeFileSync(reposCacheFile, JSON.stringify({ repos: currentRepoNames, updatedAt: new Date().toISOString() }), 'utf8');
        } catch (e) {
          console.error('Failed to write repos cache file:', e);
        }

        // Send Discord notifications for deleted repos
        for (const deletedRepo of deletedRepos) {
          const envVarName = EVENT_CHANNEL_MAP['repository_delete'] || 'DISCORD_CHANNEL_DEFAULT';
          const channelId = process.env[envVarName] || process.env.DISCORD_CHANNEL_DEFAULT || '';
          const lang = await getLanguageForChannel(channelId, 'repository_delete');

          const embed = {
            title: t('repo_deleted_title', lang),
            description: t('repo_deleted_desc', lang, {
              sender: username,
              senderUrl: `https://github.com/${username}`,
              repository: deletedRepo
            }),
            color: 15158332, // Red
            fields: [
              { name: 'Repository', value: deletedRepo, inline: true },
              { name: 'Owner', value: username, inline: true }
            ],
            timestamp: new Date().toISOString(),
            footer: {
              text: 'GitCord Poller',
              icon_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
            },
            author: {
              name: username,
              url: `https://github.com/${username}`,
              icon_url: `https://github.com/${username}.png`,
            },
          };

          const discordResult = await sendToDiscord('repository_delete', { embeds: [embed] });

          if (discordResult.success) {
            const log = addLog({
              eventType: 'repository_delete-poll',
              repository: deletedRepo,
              sender: username,
              description: `Poller: user deleted repository **${deletedRepo}**`,
              status: 'success',
              details: `Detected repo deletion via repo list diff. Discord Channel ID: ${discordResult.channelId}`
            });
            processedEvents.push(log);
          } else {
            const log = addLog({
              eventType: 'repository_delete-poll',
              repository: deletedRepo,
              sender: username,
              description: `Poller: user deleted repository **${deletedRepo}** (FAILED)`,
              status: 'error',
              details: `Failed to send repo deletion notification. Error: ${discordResult.error}`
            });
            processedEvents.push(log);
          }
        }
      }
    } catch (e) {
      console.error('Failed to detect deleted repos:', e);
    }

    if (processedEvents.length > 0) {
      await logSystem('log', `[Activity Poller] Synced ${processedEvents.length} new GitHub activity events for user @${username}`);
    }

    return NextResponse.json({ 
      success: true, 
      count: processedEvents.length, 
      events: processedEvents,
      deletedRepos: deletedRepos.length > 0 ? deletedRepos : undefined
    });
  } catch (error: any) {
    await logSystem('error', 'GitHub polling error:', error.message || error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Unknown server error during sync' 
    }, { status: 500 });
  }
}
