import { NextRequest, NextResponse } from 'next/server';
import { formatPolledEvent } from '@/lib/github';
import { sendToDiscord, addLog, EVENT_CHANNEL_MAP } from '@/lib/discord';
import { logSystem } from '@/lib/console-hook';
import { resolveGuildIdForChannel, getLanguageForChannel } from '@/lib/i18n';
import { t } from '@/lib/i18n';

// --- Persistent state via Discord messages (survives Vercel cold starts) ---

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * Reads the last processed event ID and repo list from a pinned "state" message
 * in the logs channel. This persists across Vercel cold starts unlike /tmp.
 * Message format: `[GITCORD_STATE] lastEventId=<id> repos=<json>`
 */
async function readPersistedState(botToken: string, channelId: string): Promise<{ lastEventId: string | null; repos: string[] }> {
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/pins`, {
      headers: { 'Authorization': `Bot ${botToken}` },
    });
    if (!res.ok) return { lastEventId: null, repos: [] };

    const pins = await res.json();
    if (!Array.isArray(pins)) return { lastEventId: null, repos: [] };

    const stateMsg = pins.find((msg: any) => msg.content?.startsWith('[GITCORD_STATE]'));
    if (!stateMsg) return { lastEventId: null, repos: [] };

    const content = stateMsg.content;
    const eventIdMatch = content.match(/lastEventId=(\S+)/);
    const reposMatch = content.match(/repos=(\[.*\])/);

    let repos: string[] = [];
    if (reposMatch) {
      try { repos = JSON.parse(reposMatch[1]); } catch {}
    }

    return {
      lastEventId: eventIdMatch ? eventIdMatch[1] : null,
      repos,
    };
  } catch (e) {
    console.error('Failed to read persisted state from Discord:', e);
    return { lastEventId: null, repos: [] };
  }
}

/**
 * Writes/updates the persisted state message in the logs channel.
 * Creates a new pinned message if none exists, or edits the existing one.
 */
async function writePersistedState(
  botToken: string,
  channelId: string,
  lastEventId: string,
  repos: string[]
): Promise<void> {
  const content = `[GITCORD_STATE] lastEventId=${lastEventId} repos=${JSON.stringify(repos)}`;

  try {
    // Find existing state message in pins
    const pinsRes = await fetch(`${DISCORD_API}/channels/${channelId}/pins`, {
      headers: { 'Authorization': `Bot ${botToken}` },
    });

    let existingMsgId: string | null = null;
    if (pinsRes.ok) {
      const pins = await pinsRes.json();
      if (Array.isArray(pins)) {
        const stateMsg = pins.find((msg: any) => msg.content?.startsWith('[GITCORD_STATE]'));
        if (stateMsg) existingMsgId = stateMsg.id;
      }
    }

    if (existingMsgId) {
      // Edit existing pinned message
      await fetch(`${DISCORD_API}/channels/${channelId}/messages/${existingMsgId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });
    } else {
      // Create new message and pin it
      const createRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (createRes.ok) {
        const newMsg = await createRes.json();
        await fetch(`${DISCORD_API}/channels/${channelId}/pins/${newMsg.id}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bot ${botToken}` },
        });
      }
    }
  } catch (e) {
    console.error('Failed to write persisted state to Discord:', e);
  }
}

export async function POST(request: NextRequest) {
  const username = process.env.GITHUB_USERNAME;
  const pat = process.env.GITHUB_PAT;
  const botToken = process.env.DISCORD_TOKEN || '';
  const stateChannelId = process.env.DISCORD_CHANNEL_LOGS || process.env.DISCORD_CHANNEL_DEFAULT || '';

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

    const response = await fetch(`https://api.github.com/users/${username}/events?per_page=30`, {
      headers,
      next: { revalidate: 0 }
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

    // Read persisted state from Discord (survives Vercel cold starts)
    const persistedState = await readPersistedState(botToken, stateChannelId);
    const lastEventId = persistedState.lastEventId;
    const previousRepoNames = persistedState.repos;

    let eventsToProcess: any[] = [];

    if (lastEventId) {
      const lastEventIndex = events.findIndex((e: any) => e.id === lastEventId);
      
      if (lastEventIndex > 0) {
        // Events before lastEventIndex are newer (reverse chronological)
        eventsToProcess = events.slice(0, lastEventIndex);
      } else if (lastEventIndex === 0) {
        // No new events since last sync
        eventsToProcess = [];
      } else {
        // lastEventId no longer in the list — use numeric ID comparison to avoid duplicates
        // GitHub event IDs are monotonically increasing numeric strings
        eventsToProcess = events.filter((e: any) => {
          try {
            return BigInt(e.id) > BigInt(lastEventId);
          } catch {
            return false; // Skip if IDs can't be compared
          }
        });
      }
    } else {
      // First run ever: save state only, don't spam with historical events
      eventsToProcess = [];
    }

    // Process new events (from oldest to newest to post in chronological order)
    const processedEvents = [];
    eventsToProcess.reverse();

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

    // --- Detect deleted repositories via repo list comparison ---
    let deletedRepos: string[] = [];
    let currentRepoNames: string[] = [];

    try {
      // Use authenticated endpoint to include private repos
      const reposRes = await fetch(`https://api.github.com/user/repos?per_page=100&sort=full_name&affiliation=owner`, {
        headers,
        next: { revalidate: 0 }
      });

      if (reposRes.ok) {
        const repos = await reposRes.json();
        currentRepoNames = Array.isArray(repos) 
          ? repos.map((r: any) => r.full_name) 
          : [];

        // Only detect deletions if we have a previous list to compare against
        if (previousRepoNames.length > 0) {
          deletedRepos = previousRepoNames.filter(name => !currentRepoNames.includes(name));
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
            color: 15158332,
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

    // Persist state to Discord (survives Vercel cold starts)
    const newestEventId = events[0].id;
    await writePersistedState(
      botToken,
      stateChannelId,
      newestEventId,
      currentRepoNames.length > 0 ? currentRepoNames : previousRepoNames
    );

    if (processedEvents.length > 0) {
      await logSystem('log', `[Activity Poller] Synced ${processedEvents.length} new GitHub activity events for user @${username}`);
    }

    return NextResponse.json({ 
      success: true, 
      count: processedEvents.length, 
      events: processedEvents,
      deletedRepos: deletedRepos.length > 0 ? deletedRepos : undefined,
      debug: {
        lastEventId,
        newestEventId,
        totalEventsFromGH: events.length,
        eventsConsidered: eventsToProcess.length,
        reposTracked: currentRepoNames.length,
      }
    });
  } catch (error: any) {
    await logSystem('error', 'GitHub polling error:', error.message || error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Unknown server error during sync' 
    }, { status: 500 });
  }
}
