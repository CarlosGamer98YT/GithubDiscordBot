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
