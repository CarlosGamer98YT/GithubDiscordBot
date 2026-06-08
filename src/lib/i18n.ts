import fs from 'fs';
import path from 'path';

// Language dictionary
export const translations = {
  en: {
    star_title: '🌟 Repository Starred!',
    star_desc: '[**{sender}**]({senderUrl}) starred [**{repository}**]({repoUrl})',
    star_total: 'Total Stars',
    
    fork_title: '🍴 Repository Forked!',
    fork_desc: '[**{sender}**]({senderUrl}) forked [**{repository}**]({repoUrl})\ninto [**{forkee}**]({forkeeUrl})',
    fork_source: 'Source Repository',
    fork_forked: 'Forked Repository',
    
    issue_title: '🐛 Issue #{number} {action}',
    issue_no_desc: '*No description provided.*',
    
    pr_title: '🔀 Pull Request #{number} {action}',
    pr_creator: 'Creator',
    pr_branches: 'Branches',
    pr_no_desc: '*No description provided.*',
    
    workflow_title: '{icon} Workflow Run {conclusion}',
    workflow_desc: 'Workflow **{name}** (run #{number}) completed with status **{conclusion}**',
    workflow_trigger: 'Trigger Event',
    workflow_commit: 'Commit Message',
    
    push_title_merge: '🔀 Merge Commited to {branch}',
    push_title_push: '🚀 Commits Pushed to {branch}',
    push_commits: 'Commits Count',
    push_author: 'Author',
    
    poller_star_title: '🌟 Starred a Repository!',
    poller_star_desc: 'You ([**{actor}**]({actorUrl})) starred [**{repoName}**]({repoUrl})',
    
    poller_fork_title: '🍴 Forked a Repository!',
    poller_fork_desc: 'You ([**{actor}**]({actorUrl})) forked [**{repoName}**]({repoUrl})\ninto [**{forkeeName}**]({forkeeUrl})',
    
    poller_pr_desc: 'You ([**{actor}**]({actorUrl})) {action} PR [**#{number} {title}**]({prUrl})',
    
    poller_push_title: '🚀 Pushed Commits to {branch}!',
    poller_push_desc: 'You ([**{actor}**]({actorUrl})) pushed {count} commit(s) to [**{repoName}**]({repoUrl})',

    repo_created_title: '🆕 Repository Created!',
    repo_created_desc: '[**{sender}**]({senderUrl}) created repository [**{repository}**]({repoUrl})',
    repo_deleted_title: '🗑️ Repository Deleted!',
    repo_deleted_desc: '[**{sender}**]({senderUrl}) deleted repository **{repository}**'
  },
  es: {
    star_title: '🌟 ¡Repositorio con Estrella!',
    star_desc: '[**{sender}**]({senderUrl}) le dio una estrella a [**{repository}**]({repoUrl})',
    star_total: 'Estrellas Totales',
    
    fork_title: '🍴 ¡Repositorio Bifurcado (Fork)!',
    fork_desc: '[**{sender}**]({senderUrl}) hizo un fork de [**{repository}**]({repoUrl})\nen [**{forkee}**]({forkeeUrl})',
    fork_source: 'Repositorio Origen',
    fork_forked: 'Repositorio Bifurcado',
    
    issue_title: '🐛 Issue #{number} {action}',
    issue_no_desc: '*Sin descripción proporcionada.*',
    
    pr_title: '🔀 Pull Request #{number} {action}',
    pr_creator: 'Creador',
    pr_branches: 'Ramas',
    pr_no_desc: '*Sin descripción proporcionada.*',
    
    workflow_title: '{icon} Ejecución de Workflow {conclusion}',
    workflow_desc: 'El workflow **{name}** (ejecución #{number}) se completó con estado **{conclusion}**',
    workflow_trigger: 'Evento Disparador',
    workflow_commit: 'Mensaje de Commit',
    
    push_title_merge: '🔀 Merge Confirmado en {branch}',
    push_title_push: '🚀 Commits Enviados (Push) a {branch}',
    push_commits: 'Cantidad de Commits',
    push_author: 'Autor',
    
    poller_star_title: '🌟 ¡Diste una Estrella!',
    poller_star_desc: 'Tú ([**{actor}**]({actorUrl})) le diste estrella a [**{repoName}**]({repoUrl})',
    
    poller_fork_title: '🍴 ¡Hiciste un Fork!',
    poller_fork_desc: 'Tú ([**{actor}**]({actorUrl})) hiciste fork de [**{repoName}**]({repoUrl})\nen [**{forkeeName}**]({forkeeUrl})',
    
    poller_pr_desc: 'Tú ([**{actor}**]({actorUrl})) {action} PR [**#{number} {title}**]({prUrl})',
    
    poller_push_title: '🚀 ¡Hiciste Push de Commits a {branch}!',
    poller_push_desc: 'Tú ([**{actor}**]({actorUrl})) enviaste {count} commit(s) a [**{repoName}**]({repoUrl})',

    repo_created_title: '🆕 ¡Repositorio Creado!',
    repo_created_desc: '[**{sender}**]({senderUrl}) creó el repositorio [**{repository}**]({repoUrl})',
    repo_deleted_title: '🗑️ ¡Repositorio Eliminado!',
    repo_deleted_desc: '[**{sender}**]({senderUrl}) eliminó el repositorio **{repository}**'
  }
};

const getLanguageFilePath = () => {
  if (process.env.VERCEL) {
    return path.join('/tmp', 'guild_languages.json');
  }
  return path.join(process.cwd(), 'guild_languages.json');
};

const getChannelCacheFilePath = () => {
  if (process.env.VERCEL) {
    return path.join('/tmp', 'channel_guild_map.json');
  }
  return path.join(process.cwd(), 'channel_guild_map.json');
};

// Local in-memory caches (for Vercel warm instances)
let guildLangCache: Record<string, 'en' | 'es'> = {};
let channelGuildCache: Record<string, string> = {};
let channelLangTopicCache: Record<string, 'en' | 'es'> = {};

/**
 * Saves guild language setting
 */
export async function setGuildLanguage(guildId: string, lang: 'en' | 'es') {
  guildLangCache[guildId] = lang;
  
  try {
    const filePath = getLanguageFilePath();
    let data: Record<string, 'en' | 'es'> = {};
    if (fs.existsSync(filePath)) {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    data[guildId] = lang;
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  } catch (e) {
    console.error('Failed to write guild language cache file:', e);
  }
}

/**
 * Saves channel to guild mapping cache
 */
export async function saveChannelGuildMap(map: Record<string, string>) {
  Object.assign(channelGuildCache, map);
  try {
    const filePath = getChannelCacheFilePath();
    let data: Record<string, string> = {};
    if (fs.existsSync(filePath)) {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    Object.assign(data, map);
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  } catch (e) {
    console.error('Failed to write channel-guild cache file:', e);
  }
}

/**
 * Gets guild language setting
 */
export async function getGuildLanguage(guildId: string): Promise<'en' | 'es'> {
  if (guildLangCache[guildId]) {
    return guildLangCache[guildId];
  }
  
  // Read from json file
  try {
    const filePath = getLanguageFilePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data[guildId]) {
        guildLangCache[guildId] = data[guildId];
        return data[guildId];
      }
      
      // Smart Fallback: If guildId is 'global' or not found, but we have configurations in the file,
      // check if there is a single language configured across all guilds and use it.
      const keys = Object.keys(data);
      if (keys.length > 0) {
        const langs = Object.values(data);
        const uniqueLangs = Array.from(new Set(langs));
        if (uniqueLangs.length === 1) {
          return uniqueLangs[0] as 'en' | 'es';
        }
      }
    }
  } catch (e) {
    console.error('Failed to read guild language cache file:', e);
  }

  // Fallback to DEFAULT_LANGUAGE env variable or 'en'
  return (process.env.DEFAULT_LANGUAGE as 'en' | 'es') || 'en';
}

/**
 * Resolves the guild ID for a given channel ID using the Discord REST API
 * and caches the result.
 */
export async function resolveGuildIdForChannel(channelId: string): Promise<string> {
  if (channelGuildCache[channelId]) {
    return channelGuildCache[channelId];
  }

  // Read from json file
  try {
    const filePath = getChannelCacheFilePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data[channelId]) {
        channelGuildCache[channelId] = data[channelId];
        return data[channelId];
      }
    }
  } catch (e) {
    console.error('Failed to read channel-guild cache file:', e);
  }

  const botToken = process.env.DISCORD_TOKEN;
  if (!botToken || !channelId) return 'global';

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: {
        'Authorization': `Bot ${botToken}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      const guildId = data.guild_id || 'global';
      
      // Cache it
      channelGuildCache[channelId] = guildId;
      try {
        const filePath = getChannelCacheFilePath();
        let fileData: Record<string, string> = {};
        if (fs.existsSync(filePath)) {
          fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        fileData[channelId] = guildId;
        fs.writeFileSync(filePath, JSON.stringify(fileData), 'utf8');
      } catch (e) {
        console.error('Failed to write channel-guild cache file:', e);
      }
      
      return guildId;
    }
  } catch (error) {
    console.error(`Failed to resolve guild for channel ${channelId} via Discord API:`, error);
  }

  return 'global';
}

/**
 * Gets the language setting for a specific channel ID (using environment, local file, or Discord topic).
 */
export async function getLanguageForChannel(channelId: string, eventType?: string): Promise<'en' | 'es'> {
  if (!channelId) return (process.env.DEFAULT_LANGUAGE as 'en' | 'es') || 'en';

  // 1. Check environment variables first
  if (eventType) {
    const eventLangEnv = `DISCORD_LANG_${eventType.toUpperCase()}`;
    if (process.env[eventLangEnv] === 'en' || process.env[eventLangEnv] === 'es') {
      return process.env[eventLangEnv] as 'en' | 'es';
    }
  }

  if (process.env.DISCORD_CHANNEL_LANGUAGES) {
    const pairs = process.env.DISCORD_CHANNEL_LANGUAGES.split(',');
    for (const pair of pairs) {
      const [cId, lang] = pair.split(':');
      if (cId === channelId && (lang === 'en' || lang === 'es')) {
        return lang as 'en' | 'es';
      }
    }
  }

  // 2. Check memory/file cache for channel specific configuration
  if (channelLangTopicCache[channelId]) {
    return channelLangTopicCache[channelId];
  }

  const filePath = getLanguageFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data[channelId] === 'en' || data[channelId] === 'es') {
        channelLangTopicCache[channelId] = data[channelId] as 'en' | 'es';
        return data[channelId] as 'en' | 'es';
      }
    }
  } catch {}

  // 3. Resolve guild ID and check guild language setting
  const guildId = await resolveGuildIdForChannel(channelId);
  if (guildId && guildId !== 'global') {
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (data[guildId] === 'en' || data[guildId] === 'es') {
          return data[guildId] as 'en' | 'es';
        }
      }
    } catch {}
  }

  // 4. Fetch details from Discord API to check if it's cached in the channel topic
  const botToken = process.env.DISCORD_TOKEN;
  if (botToken) {
    try {
      const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
        headers: {
          'Authorization': `Bot ${botToken}`
        },
        next: { revalidate: 300 } // Cache for 5 minutes in Next.js/Vercel
      } as any);

      if (res.ok) {
        const data = await res.json();
        if (data.topic) {
          const match = data.topic.match(/\[gitcord-lang:\s*(en|es)\]/i);
          if (match) {
            const topicLang = match[1].toLowerCase() as 'en' | 'es';
            channelLangTopicCache[channelId] = topicLang;
            return topicLang;
          }
        }
      }
    } catch (err: any) {
      console.error(`[i18n] Error checking channel topic on Discord:`, err.message || err);
    }
  }

  // 5. Fallback: If there is a single language configured across the file, use it
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const langs = Object.values(data).filter(v => v === 'en' || v === 'es');
      const uniqueLangs = Array.from(new Set(langs));
      if (uniqueLangs.length === 1) {
        return uniqueLangs[0] as 'en' | 'es';
      }
    }
  } catch {}

  // 6. Final fallback
  return (process.env.DEFAULT_LANGUAGE as 'en' | 'es') || 'en';
}

/**
 * Updates a Discord channel's topic to append the language configuration tag.
 */
export async function updateChannelTopicLanguage(channelId: string, lang: 'en' | 'es'): Promise<boolean> {
  const botToken = process.env.DISCORD_TOKEN;
  if (!botToken || !channelId) return false;

  try {
    // 1. Fetch channel details to preserve existing topic
    const getRes = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      headers: {
        'Authorization': `Bot ${botToken}`,
      },
      next: { revalidate: 0 }
    } as any);

    if (!getRes.ok) {
      console.warn(`[i18n] Failed to fetch channel details to update topic: status ${getRes.status}`);
      return false;
    }

    const channelData = await getRes.json();
    const currentTopic = channelData.topic || '';
    
    // 2. Strip existing gitcord-lang tag and append new one
    const cleanTopic = currentTopic.replace(/\[gitcord-lang:\s*(en|es)\]/gi, '').trim();
    const newTopic = cleanTopic ? `${cleanTopic} [gitcord-lang: ${lang}]` : `[gitcord-lang: ${lang}]`;

    // 3. Patch the channel topic
    const patchRes = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: newTopic,
      }),
    });

    if (patchRes.ok) {
      channelLangTopicCache[channelId] = lang;
      
      // Also save locally in the JSON file for additional redundancy
      try {
        const filePath = getLanguageFilePath();
        let data: Record<string, string> = {};
        if (fs.existsSync(filePath)) {
          data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        data[channelId] = lang;
        fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
      } catch (e) {
        console.error('Failed to write channel language cache file:', e);
      }

      console.log(`[i18n] Successfully updated Discord channel topic for ${channelId} to: "${newTopic}"`);
      return true;
    } else {
      const errText = await patchRes.text();
      console.warn(`[i18n] Failed to patch channel topic: status ${patchRes.status} - ${errText}`);
      return false;
    }
  } catch (err: any) {
    console.error(`[i18n] Error updating channel topic for ${channelId}:`, err.message || err);
    return false;
  }
}

/**
 * Translates a key with replacements
 */
export function t(key: keyof typeof translations.en, lang: 'en' | 'es', replacements: Record<string, string> = {}): string {
  const dict = translations[lang] || translations.en;
  let val = dict[key] || translations.en[key] || '';
  
  Object.entries(replacements).forEach(([k, v]) => {
    val = val.replace(new RegExp(`{${k}}`, 'g'), v);
  });
  
  return val;
}
