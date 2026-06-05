import { sendToDiscord } from './discord';

declare global {
  var consoleHooked: boolean | undefined;
}

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

let isForwarding = false;

function formatConsoleMsg(args: any[]): string {
  return args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
}

async function forwardToDiscord(type: 'log' | 'warn' | 'error', message: string) {
  // Prevent infinite recursion loops if sending to Discord logs something
  if (isForwarding) return;
  
  const logChannelId = process.env.DISCORD_CHANNEL_LOGS;
  const botToken = process.env.DISCORD_TOKEN;
  
  if (!logChannelId || !botToken) return;

  // Filter out Next.js development spam (like webpack compiling logs) to prevent cluttering Discord
  if (
    message.includes('compiled successfully') || 
    message.includes('Telemetry') || 
    message.includes('Attention') ||
    message.includes('API responded with status') ||
    message.includes('Console hooks initialized')
  ) {
    return;
  }

  isForwarding = true;
  try {
    let icon = 'ℹ️';
    let color = 9807270; // Grey
    
    if (type === 'warn') {
      icon = '⚠️';
      color = 16753920; // Orange
    } else if (type === 'error') {
      icon = '❌';
      color = 15158332; // Red
    }

    const payload = {
      embeds: [{
        title: `${icon} Console ${type.toUpperCase()}`,
        description: `\`\`\`javascript\n${message.substring(0, 1900)}\n\`\`\``,
        color,
        timestamp: new Date().toISOString(),
        footer: { text: 'GitCord Server Logs' }
      }]
    };

    // Use fetch directly using original console log on error
    const response = await fetch(`https://discord.com/api/v10/channels/${logChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      originalError(`[Console Hook Error] Discord API responded with status ${response.status}`);
    }
  } catch (err) {
    originalError('[Console Hook Error] Failed to send console log to Discord:', err);
  } finally {
    isForwarding = false;
  }
}

export function initConsoleHook() {
  if (globalThis.consoleHooked) {
    return;
  }

  globalThis.consoleHooked = true;

  console.log = (...args: any[]) => {
    originalLog(...args);
    const msg = formatConsoleMsg(args);
    forwardToDiscord('log', msg);
  };

  console.warn = (...args: any[]) => {
    originalWarn(...args);
    const msg = formatConsoleMsg(args);
    forwardToDiscord('warn', msg);
  };

  console.error = (...args: any[]) => {
    originalError(...args);
    const msg = formatConsoleMsg(args);
    forwardToDiscord('error', msg);
  };

  originalLog('🔌 Console hooks initialized. Output is being mirrored to Discord logs channel.');
}
