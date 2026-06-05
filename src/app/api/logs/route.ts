import { NextRequest, NextResponse } from 'next/server';
import { getLogs, EVENT_CHANNEL_MAP } from '@/lib/discord';

export async function GET(request: NextRequest) {
  // Prevent Next.js from caching this API response
  const headers = new Headers();
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  // Mapped channels check
  const channels = Object.entries(EVENT_CHANNEL_MAP).map(([event, envVar]) => {
    const val = process.env[envVar] || '';
    const defVal = process.env.DISCORD_CHANNEL_DEFAULT || '';
    const isConfigured = val.length > 0;
    const isUsingDefault = !isConfigured && defVal.length > 0;

    return {
      event,
      envVar,
      isConfigured: isConfigured || isUsingDefault,
      isUsingDefault,
      valueMasked: isConfigured 
        ? `${val.substring(0, 4)}...${val.substring(val.length - 4)}` 
        : (isUsingDefault ? 'Fallback to Default' : 'Missing')
    };
  });

  // Default channel check
  const defVal = process.env.DISCORD_CHANNEL_DEFAULT || '';
  const defaultChannel = {
    event: 'default',
    envVar: 'DISCORD_CHANNEL_DEFAULT',
    isConfigured: defVal.length > 0,
    isUsingDefault: false,
    valueMasked: defVal.length > 0 
      ? `${defVal.substring(0, 4)}...${defVal.substring(defVal.length - 4)}` 
      : 'Missing'
  };

  channels.push(defaultChannel);

  const diagnostics = {
    discordTokenSet: !!process.env.DISCORD_TOKEN,
    discordPublicKeySet: !!process.env.DISCORD_PUBLIC_KEY,
    githubUsername: process.env.GITHUB_USERNAME || null,
    githubPatSet: !!process.env.GITHUB_PAT,
    channels
  };

  return NextResponse.json({
    logs: getLogs(),
    diagnostics
  }, { 
    status: 200,
    headers 
  });
}
