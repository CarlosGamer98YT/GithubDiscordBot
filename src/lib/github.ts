import { DiscordMessage, DiscordEmbed } from '@/types';
import { t } from './i18n';

/**
 * Parses a GitHub Webhook event and formats it into a DiscordMessage in the specified language.
 */
export function formatWebhookEvent(
  event: string, 
  payload: any, 
  lang: 'en' | 'es' = 'en'
): { message: DiscordMessage; description: string; repoName: string; senderName: string } | null {
  const repository = payload.repository?.full_name || 'unknown-repo';
  const repoUrl = payload.repository?.html_url || '';
  const sender = payload.sender?.login || 'ghost';
  const senderUrl = payload.sender?.html_url || '';
  const senderAvatar = payload.sender?.avatar_url || '';

  let description = '';
  const embeds: DiscordEmbed[] = [];

  const baseEmbed: DiscordEmbed = {
    timestamp: new Date().toISOString(),
    footer: {
      text: 'GitCord Bot',
      icon_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
    },
    author: {
      name: sender,
      url: senderUrl,
      icon_url: senderAvatar,
    },
  };

  switch (event) {
    case 'watch': {
      if (payload.action !== 'started') return null;
      description = `starred **${repository}**`;
      
      embeds.push({
        ...baseEmbed,
        title: t('star_title', lang),
        description: t('star_desc', lang, { sender, senderUrl, repository, repoUrl }),
        color: 16772864, // Gold
        fields: [
          { name: 'Repository', value: `[${repository}](${repoUrl})`, inline: true },
          { name: t('star_total', lang), value: payload.repository?.stargazers_count?.toString() || 'N/A', inline: true }
        ]
      });
      break;
    }

    case 'fork': {
      const forkee = payload.forkee?.full_name || 'unknown-fork';
      const forkeeUrl = payload.forkee?.html_url || '';
      description = `forked **${repository}** to **${forkee}**`;

      embeds.push({
        ...baseEmbed,
        title: t('fork_title', lang),
        description: t('fork_desc', lang, { sender, senderUrl, repository, repoUrl, forkee, forkeeUrl }),
        color: 3447003, // Cyan/Blue
        fields: [
          { name: t('fork_source', lang), value: `[${repository}](${repoUrl})`, inline: true },
          { name: t('fork_forked', lang), value: `[${forkee}](${forkeeUrl})`, inline: true }
        ]
      });
      break;
    }

    case 'issues': {
      const issue = payload.issue;
      if (!issue) return null;
      const action = payload.action; // opened, closed, reopened
      description = `${action} issue #${issue.number} on **${repository}**`;

      let color = 15158332; // Red
      if (action === 'closed') color = 3066993; // Green
      if (action === 'reopened') color = 10181046; // Purple

      embeds.push({
        ...baseEmbed,
        title: t('issue_title', lang, { number: issue.number.toString(), action: action.toUpperCase() }),
        url: issue.html_url,
        description: `**[${issue.title}](${issue.html_url})**\n\n${issue.body ? (issue.body.length > 200 ? issue.body.substring(0, 200) + '...' : issue.body) : t('issue_no_desc', lang)}`,
        color,
        fields: [
          { name: 'Repository', value: `[${repository}](${repoUrl})`, inline: true },
          { name: 'Author', value: `[${sender}](${senderUrl})`, inline: true }
        ]
      });
      break;
    }

    case 'pull_request': {
      const pr = payload.pull_request;
      if (!pr) return null;
      const action = payload.action;
      const isMerged = action === 'closed' && pr.merged === true;
      
      let titleAction = action.toUpperCase();
      let color = 10181046; // Purple

      if (isMerged) {
        titleAction = 'MERGED';
        color = 3066993; // Green
        description = `merged PR #${pr.number} in **${repository}**`;
      } else if (action === 'closed') {
        titleAction = 'CLOSED';
        color = 9807270; // Grey
        description = `closed PR #${pr.number} (unmerged) in **${repository}**`;
      } else {
        description = `${action} PR #${pr.number} in **${repository}**`;
      }

      embeds.push({
        ...baseEmbed,
        title: t('pr_title', lang, { number: pr.number.toString(), action: titleAction }),
        url: pr.html_url,
        description: `**[${pr.title}](${pr.html_url})**\n\n${pr.body ? (pr.body.length > 200 ? pr.body.substring(0, 200) + '...' : pr.body) : t('pr_no_desc', lang)}`,
        color,
        fields: [
          { name: 'Repository', value: `[${repository}](${repoUrl})`, inline: true },
          { name: t('pr_creator', lang), value: `[${pr.user?.login || sender}](${pr.user?.html_url || senderUrl})`, inline: true },
          { name: t('pr_branches', lang), value: `\`${pr.head?.ref}\` ➔ \`${pr.base?.ref}\``, inline: false }
        ]
      });
      break;
    }

    case 'workflow_run': {
      const run = payload.workflow_run;
      if (!run) return null;
      if (payload.action !== 'completed') return null;

      const conclusion = run.conclusion; // success, failure
      description = `workflow "${run.name}" run finished with **${conclusion}** on **${repository}**`;

      let color = 3066993; // Green
      let icon = '✅';
      if (conclusion !== 'success') {
        color = 15158332; // Red
        icon = '❌';
      }

      embeds.push({
        ...baseEmbed,
        title: t('workflow_title', lang, { icon, conclusion: conclusion.toUpperCase() }),
        url: run.html_url,
        description: t('workflow_desc', lang, { name: run.name, number: run.run_number.toString(), conclusion: conclusion.toUpperCase() }),
        color,
        fields: [
          { name: 'Repository', value: `[${repository}](${repoUrl})`, inline: true },
          { name: t('workflow_trigger', lang), value: `\`${run.event}\``, inline: true },
          { name: t('workflow_commit', lang), value: run.head_commit?.message || 'No commit message', inline: false }
        ]
      });
      break;
    }

    case 'push': {
      const commits = payload.commits || [];
      const branch = payload.ref?.replace('refs/heads/', '') || 'main';
      const headCommit = payload.head_commit;
      
      if (!headCommit) return null;

      const isMerge = headCommit.message?.toLowerCase().includes('merge pull request') || 
                      headCommit.message?.toLowerCase().includes('merge branch');
      
      description = isMerge 
        ? `merged commits into **${branch}** of **${repository}**`
        : `pushed ${commits.length} commit(s) to **${branch}** of **${repository}**`;

      embeds.push({
        ...baseEmbed,
        title: isMerge 
          ? t('push_title_merge', lang, { branch }) 
          : t('push_title_push', lang, { branch }),
        url: headCommit.url,
        description: `**[${headCommit.message.split('\n')[0]}](${headCommit.url})**`,
        color: isMerge ? 3066993 : 3447003,
        fields: [
          { name: 'Repository', value: `[${repository}](${repoUrl})`, inline: true },
          { name: t('push_commits', lang), value: commits.length.toString(), inline: true },
          { name: t('push_author', lang), value: headCommit.author?.name || headCommit.author?.username || sender, inline: true }
        ]
      });
      break;
    }

    case 'repository': {
      const action = payload.action;
      if (action !== 'created' && action !== 'deleted') return null;

      const isCreated = action === 'created';
      description = isCreated 
        ? `created repository **${repository}**` 
        : `deleted repository **${repository}**`;

      embeds.push({
        ...baseEmbed,
        title: isCreated ? t('repo_created_title', lang) : t('repo_deleted_title', lang),
        url: isCreated ? repoUrl : undefined,
        description: isCreated
          ? t('repo_created_desc', lang, { sender, senderUrl, repository, repoUrl })
          : t('repo_deleted_desc', lang, { sender, senderUrl, repository }),
        color: isCreated ? 3066993 : 15158332, // Green for creation, Red for deletion
        fields: [
          { name: 'Repository', value: isCreated ? `[${repository}](${repoUrl})` : repository, inline: true },
          { name: 'Owner', value: payload.repository?.owner?.login || sender, inline: true }
        ]
      });
      break;
    }

    default:
      return null;
  }

  return {
    message: { embeds },
    description,
    repoName: repository,
    senderName: sender,
  };
}

/**
 * Parses a polled event from the GitHub events API and maps it to a DiscordMessage in the specified language.
 */
export async function formatPolledEvent(
  event: any, 
  lang: 'en' | 'es' = 'en',
  headers: Record<string, string> = {}
): Promise<{ message: DiscordMessage; description: string; repoName: string } | null> {
  const type = event.type;
  const actor = event.actor?.login || 'User';
  const actorUrl = `https://github.com/${actor}`;
  const repoName = event.repo?.name || 'unknown-repo';
  const repoUrl = `https://github.com/${repoName}`;
  const senderAvatar = event.actor?.avatar_url || '';

  let description = '';
  const embeds: DiscordEmbed[] = [];

  const baseEmbed: DiscordEmbed = {
    timestamp: new Date().toISOString(),
    footer: {
      text: 'GitCord Poller',
      icon_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
    },
    author: {
      name: actor,
      url: actorUrl,
      icon_url: senderAvatar,
    },
  };

  switch (type) {
    case 'WatchEvent': {
      description = `starred **${repoName}**`;
      embeds.push({
        ...baseEmbed,
        title: t('poller_star_title', lang),
        description: t('poller_star_desc', lang, { actor, actorUrl, repoName, repoUrl }),
        color: 16772864, // Gold
        fields: [
          { name: 'Repository', value: `[${repoName}](${repoUrl})`, inline: true }
        ]
      });
      break;
    }

    case 'ForkEvent': {
      const forkeeName = event.payload?.forkee?.full_name || 'forked-repo';
      const forkeeUrl = `https://github.com/${forkeeName}`;
      description = `forked **${repoName}** to **${forkeeName}**`;
      
      embeds.push({
        ...baseEmbed,
        title: t('poller_fork_title', lang),
        description: t('poller_fork_desc', lang, { actor, actorUrl, repoName, repoUrl, forkeeName, forkeeUrl }),
        color: 3447003, // Blue
        fields: [
          { name: 'Source Repository', value: `[${repoName}](${repoUrl})`, inline: true },
          { name: 'Forked Repository', value: `[${forkeeName}](${forkeeUrl})`, inline: true }
        ]
      });
      break;
    }

    case 'PullRequestEvent': {
      const pr = event.payload?.pull_request;
      if (!pr) return null;
      const action = event.payload?.action || 'closed';
      const isMerged = pr.merged === true;

      let titleAction = action.toUpperCase();
      let color = 10181046; // Purple

      if (isMerged) {
        titleAction = 'MERGED';
        color = 3066993; // Green
        description = `merged PR #${pr.number} on **${repoName}**`;
      } else {
        description = `${action} PR #${pr.number} on **${repoName}**`;
      }

      embeds.push({
        ...baseEmbed,
        title: t('pr_title', lang, { number: pr.number.toString(), action: titleAction }),
        url: pr.html_url,
        description: t('poller_pr_desc', lang, { actor, actorUrl, number: pr.number.toString(), title: pr.title, prUrl: pr.html_url, action }),
        color,
        fields: [
          { name: 'Repository', value: `[${repoName}](${repoUrl})`, inline: true }
        ]
      });
      break;
    }

    case 'PushEvent': {
      const branch = event.payload?.ref?.replace('refs/heads/', '') || 'main';
      const before = event.payload?.before;
      const head = event.payload?.head;

      let commitsCount = 0;
      let headCommitMessage = 'No commit message';

      if (head) {
        // Try comparing first (if before exists and is not all zeros)
        const isBeforeValid = before && before !== '0000000000000000000000000000000000000000';
        let fetchedSuccess = false;

        if (isBeforeValid) {
          try {
            const compRes = await fetch(`https://api.github.com/repos/${repoName}/compare/${before}...${head}`, {
              headers,
              next: { revalidate: 0 }
            });
            if (compRes.ok) {
              const compData = await compRes.json();
              commitsCount = compData.total_commits || compData.commits?.length || 0;
              const lastCommit = compData.commits?.[compData.commits.length - 1];
              if (lastCommit) {
                headCommitMessage = lastCommit.commit?.message || 'No commit message';
                fetchedSuccess = true;
              }
            }
          } catch (e) {
            console.error(`Error comparing commits for ${repoName}:`, e);
          }
        }

        // Fallback to fetching head commit directly if compare failed or before is invalid
        if (!fetchedSuccess) {
          try {
            const commitRes = await fetch(`https://api.github.com/repos/${repoName}/commits/${head}`, {
              headers,
              next: { revalidate: 0 }
            });
            if (commitRes.ok) {
              const commitData = await commitRes.json();
              headCommitMessage = commitData.commit?.message || 'No commit message';
              commitsCount = 1;
            }
          } catch (e) {
            console.error(`Error fetching head commit for ${repoName}:`, e);
          }
        }
      }

      description = `pushed to **${branch}** on **${repoName}**`;
      
      embeds.push({
        ...baseEmbed,
        title: t('poller_push_title', lang, { branch }),
        url: repoUrl,
        description: t('poller_push_desc', lang, { actor, actorUrl, count: commitsCount.toString(), repoName, repoUrl }),
        color: 3447003, // Blue
        fields: [
          { name: 'Repository', value: `[${repoName}](${repoUrl})`, inline: true },
          { name: 'Head Commit Message', value: headCommitMessage, inline: false }
        ]
      });
      break;
    }

    case 'CreateEvent': {
      const refType = event.payload?.ref_type;
      const ref = event.payload?.ref;
      const masterBranch = event.payload?.master_branch;
      const isRepoCreate = refType === 'repository' || (refType === 'branch' && ref === masterBranch);
      if (!isRepoCreate) return null;

      description = `created repository **${repoName}**`;
      embeds.push({
        ...baseEmbed,
        title: t('repo_created_title', lang),
        url: repoUrl,
        description: t('repo_created_desc', lang, { sender: actor, senderUrl: actorUrl, repository: repoName, repoUrl }),
        color: 3066993, // Green
        fields: [
          { name: 'Repository', value: `[${repoName}](${repoUrl})`, inline: true },
          { name: 'Owner', value: actor, inline: true }
        ]
      });
      break;
    }

    // Note: 'DeleteEvent' with ref_type=repository is never emitted by GitHub Events API.
    // Repository deletions are detected via repo list comparison in sync-user/route.ts.

    default:
      return null;
  }

  return {
    message: { embeds },
    description,
    repoName,
  };
}
