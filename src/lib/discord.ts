import { DiscordMessage, WebhookLog } from '@/types';
import { initConsoleHook } from './console-hook';

// Initialize console hook on load if in server environment and log channel is set
if (typeof window === 'undefined' && process.env.DISCORD_CHANNEL_LOGS) {
  initConsoleHook();
}

// In-memory log buffer (persisted as long as Vercel container is warm)
// Used to showcase live logs in the session dashboard.
declare global {
  var globalLogs: WebhookLog[] | undefined;
}

if (!globalThis.globalLogs) {
  globalThis.globalLogs = [];
}

export function getLogs(): WebhookLog[] {
  return globalThis.globalLogs || [];
}

export function addLog(log: Omit<WebhookLog, 'id' | 'timestamp'>) {
  const newLog: WebhookLog = {
    ...log,
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
  };
  globalThis.globalLogs = [newLog, ...(globalThis.globalLogs || [])].slice(0, 50);
  return newLog;
}

// Map event types to environment variables
export const EVENT_CHANNEL_MAP: Record<string, string> = {
  watch: 'DISCORD_CHANNEL_STARS',
  fork: 'DISCORD_CHANNEL_FORKS',
  issues: 'DISCORD_CHANNEL_ISSUES',
  pull_request: 'DISCORD_CHANNEL_PRS',
  workflow_run: 'DISCORD_CHANNEL_ACTIONS',
  push: 'DISCORD_CHANNEL_PUSH', // Dedicated channel for pushes
  logs: 'DISCORD_CHANNEL_LOGS',  // Mirror console logs to Discord
};

export interface SendResult {
  success: boolean;
  channelId?: string;
  error?: string;
}

/**
 * Sends a message/embed to Discord via REST API.
 * Uses the bot token specified in DISCORD_TOKEN env variable.
 */
export async function sendToDiscord(eventType: string, discordMessage: DiscordMessage): Promise<SendResult> {
  const botToken = process.env.DISCORD_TOKEN;
  if (!botToken) {
    console.error('DISCORD_TOKEN is not configured in environment.');
    return { success: false, error: 'DISCORD_TOKEN is missing' };
  }

  // Determine target channel environment variable name
  const envVarName = EVENT_CHANNEL_MAP[eventType] || 'DISCORD_CHANNEL_DEFAULT';
  let channelId = process.env[envVarName] || process.env.DISCORD_CHANNEL_DEFAULT;

  if (!channelId) {
    console.warn(`No specific channel ID found for event '${eventType}' (${envVarName}) and no DISCORD_CHANNEL_DEFAULT is set.`);
    return { success: false, error: `Channel ID not configured for ${envVarName}` };
  }

  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(discordMessage),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Discord API responded with status ${response.status}: ${errorText}`);
      return { success: false, channelId, error: `Discord API error: ${response.status} ${errorText}` };
    }

    return { success: true, channelId };
  } catch (error: any) {
    console.error('Failed to send request to Discord:', error);
    return { success: false, channelId, error: error.message || 'Unknown network error' };
  }
}

let localHasNotified = false;

/**
 * Checks the Discord channel history to see if an "Activo!" message has already
 * been sent for the current deployment. If not, sends one exactly once.
 */
export async function notifyDeploymentOnce() {
  if (localHasNotified) return;

  const botToken = process.env.DISCORD_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_DEFAULT;
  
  if (!botToken || !channelId) {
    return;
  }

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_URL || 'local-dev';
  
  try {
    localHasNotified = true;

    // Fetch the last 10 messages from the default channel
    const historyRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=10`, {
      headers: {
        'Authorization': `Bot ${botToken}`,
      },
    });

    if (historyRes.ok) {
      const messages = await historyRes.json();
      const alreadySent = Array.isArray(messages) && messages.some((msg: any) => 
        msg.content && msg.content.includes('🚀') && msg.content.includes(commitSha)
      );

      if (alreadySent) {
        return;
      }
    }
  } catch (err) {
    console.error('[Deployment Notifier] Failed to verify message history:', err);
  }

  try {
    const deploymentUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'Local Dev Server';

    const embed = {
      title: '🟢 ¡Bot Activo / Bot Active!',
      description: 'El bot se ha cargado correctamente en el servidor.\n\n*The bot has successfully loaded on the server.*',
      color: 0x2ecc71,
      fields: [
        {
          name: 'Environment / Entorno',
          value: process.env.VERCEL ? 'Vercel Serverless' : 'Local Host',
          inline: true
        },
        {
          name: 'Deployment / Despliegue',
          value: process.env.VERCEL_URL ? `[Link](${deploymentUrl})` : '`localhost`',
          inline: true
        },
        {
          name: 'Commit SHA',
          value: `\`${process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7) : 'N/A'}\``,
          inline: true
        }
      ],
      timestamp: new Date().toISOString()
    };

    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: `🚀 **¡Activo!** [Deploy ID: \`${commitSha.substring(0, 7)}\`]`,
        embeds: [embed]
      }),
    });

    if (response.ok) {
      console.log(`[Deployment Notifier] Sent deployment active notification for ${commitSha}`);
    } else {
      localHasNotified = false;
    }
  } catch (err) {
    console.error('[Deployment Notifier] Failed to send active notification:', err);
    localHasNotified = false;
  }
}
