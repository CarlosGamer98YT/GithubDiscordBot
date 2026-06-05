import { DiscordMessage, DiscordEmbed } from '@/types';

/**
 * Parses a GitHub Webhook event and formats it into a DiscordMessage.
 */
export function formatWebhookEvent(event: string, payload: any): { message: DiscordMessage; description: string; repoName: string; senderName: string } | null {
  const repository = payload.repository?.full_name || 'unknown-repo';
  const repoUrl = payload.repository?.html_url || '';
  const sender = payload.sender?.login || 'ghost';
  const senderUrl = payload.sender?.html_url || '';
  const senderAvatar = payload.sender?.avatar_url || '';

  let description = '';
  const embeds: DiscordEmbed[] = [];

  // Base embed structure
  const baseEmbed: DiscordEmbed = {
    timestamp: new Date().toISOString(),
    footer: {
      text: 'GitHub Discord Bot',
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
        title: `🌟 Repository Starred!`,
        description: `[**${sender}**](${senderUrl}) starred [**${repository}**](${repoUrl})`,
        color: 16772864, // Gold/Yellow (#FFD700)
        fields: [
          { name: 'Repository', value: `[${repository}](${repoUrl})`, inline: true },
          { name: 'Total Stars', value: payload.repository?.stargazers_count?.toString() || 'N/A', inline: true }
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
        title: `🍴 Repository Forked!`,
        description: `[**${sender}**](${senderUrl}) forked [**${repository}**](${repoUrl})\ninto [**${forkee}**](${forkeeUrl})`,
        color: 3447003, // Cyan/Blue (#3498DB)
        fields: [
          { name: 'Source Repository', value: `[${repository}](${repoUrl})`, inline: true },
          { name: 'Forked Repository', value: `[${forkee}](${forkeeUrl})`, inline: true }
        ]
      });
      break;
    }

    case 'issues': {
      const issue = payload.issue;
      if (!issue) return null;
      const action = payload.action; // opened, closed, reopened, etc.
      description = `${action} issue #${issue.number} on **${repository}**`;

      let color = 15158332; // Red for opened (#E74C3C)
      if (action === 'closed') color = 3066993; // Green for closed (#2ECC71)
      if (action === 'reopened') color = 10181046; // Purple (#9B59B6)

      embeds.push({
        ...baseEmbed,
        title: `🐛 Issue #${issue.number} ${action.toUpperCase()}`,
        url: issue.html_url,
        description: `**[${issue.title}](${issue.html_url})**\n\n${issue.body ? (issue.body.length > 200 ? issue.body.substring(0, 200) + '...' : issue.body) : '*No description provided.*'}`,
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
      const action = payload.action; // opened, closed, reopened
      const isMerged = action === 'closed' && pr.merged === true;
      
      let titleAction = action.toUpperCase();
      let color = 10181046; // Purple for opened/reopened (#9B59B6)

      if (isMerged) {
        titleAction = 'MERGED';
        color = 3066993; // Green for merged (#2ECC71)
        description = `merged PR #${pr.number} in **${repository}**`;
      } else if (action === 'closed') {
        titleAction = 'CLOSED (UNMERGED)';
        color = 9807270; // Dark grey (#95A5A6)
        description = `closed PR #${pr.number} (unmerged) in **${repository}**`;
      } else {
        description = `${action} PR #${pr.number} in **${repository}**`;
      }

      embeds.push({
        ...baseEmbed,
        title: `🔀 Pull Request #${pr.number} ${titleAction}`,
        url: pr.html_url,
        description: `**[${pr.title}](${pr.html_url})**\n\n${pr.body ? (pr.body.length > 200 ? pr.body.substring(0, 200) + '...' : pr.body) : '*No description provided.*'}`,
        color,
        fields: [
          { name: 'Repository', value: `[${repository}](${repoUrl})`, inline: true },
          { name: 'Creator', value: `[${pr.user?.login || sender}](${pr.user?.html_url || senderUrl})`, inline: true },
          { name: 'Branches', value: `\`${pr.head?.ref}\` ➔ \`${pr.base?.ref}\``, inline: false }
        ]
      });
      break;
    }

    case 'workflow_run': {
      const run = payload.workflow_run;
      if (!run) return null;
      if (payload.action !== 'completed') return null; // Only notify on completion

      const conclusion = run.conclusion; // success, failure, cancelled, timed_out
      description = `workflow "${run.name}" run finished with **${conclusion}** on **${repository}**`;

      let color = 3066993; // Green for success
      let icon = '✅';
      if (conclusion !== 'success') {
        color = 15158332; // Red for failure/other
        icon = '❌';
      }

      embeds.push({
        ...baseEmbed,
        title: `${icon} Workflow Run ${conclusion.toUpperCase()}`,
        url: run.html_url,
        description: `Workflow **${run.name}** (run #${run.run_number}) completed with status **${conclusion}**`,
        color,
        fields: [
          { name: 'Repository', value: `[${repository}](${repoUrl})`, inline: true },
          { name: 'Trigger Event', value: `\`${run.event}\``, inline: true },
          { name: 'Commit Message', value: run.head_commit?.message || 'No commit message', inline: false }
        ]
      });
      break;
    }

    case 'push': {
      // Parse standard push events as well as merges
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
        title: isMerge ? `🔀 Merge Commited to ${branch}` : `🚀 Commits Pushed to ${branch}`,
        url: headCommit.url,
        description: `**[${headCommit.message.split('\n')[0]}](${headCommit.url})**`,
        color: isMerge ? 3066993 : 3447003, // Green for merge, Blue for push
        fields: [
          { name: 'Repository', value: `[${repository}](${repoUrl})`, inline: true },
          { name: 'Commits Count', value: commits.length.toString(), inline: true },
          { name: 'Author', value: headCommit.author?.name || headCommit.author?.username || sender, inline: true }
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
 * Parses a polled event from the GitHub events API and maps it to a DiscordMessage.
 * This handles events done BY the user.
 */
export function formatPolledEvent(event: any): { message: DiscordMessage; description: string; repoName: string } | null {
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
      text: 'GitHub Discord Poller',
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
        title: `🌟 Starred a Repository!`,
        description: `You ([**${actor}**](${actorUrl})) starred [**${repoName}**](${repoUrl})`,
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
        title: `🍴 Forked a Repository!`,
        description: `You ([**${actor}**](${actorUrl})) forked [**${repoName}**](${repoUrl})\ninto [**${forkeeName}**](${forkeeUrl})`,
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
        title: `🔀 Pull Request #${pr.number} ${titleAction}`,
        url: pr.html_url,
        description: `You ([**${actor}**](${actorUrl})) ${action} PR [**#${pr.number} ${pr.title}**](${pr.html_url})`,
        color,
        fields: [
          { name: 'Repository', value: `[${repoName}](${repoUrl})`, inline: true }
        ]
      });
      break;
    }

    case 'PushEvent': {
      const commits = event.payload?.commits || [];
      const branch = event.payload?.ref?.replace('refs/heads/', '') || 'main';
      const headCommit = commits[0];
      description = `pushed to **${branch}** on **${repoName}**`;
      
      embeds.push({
        ...baseEmbed,
        title: `🚀 Pushed Commits to ${branch}!`,
        url: repoUrl,
        description: `You ([**${actor}**](${actorUrl})) pushed ${commits.length} commit(s) to [**${repoName}**](${repoUrl})`,
        color: 3447003, // Blue
        fields: [
          { name: 'Repository', value: `[${repoName}](${repoUrl})`, inline: true },
          { name: 'Head Commit Message', value: headCommit?.message || 'No commit message', inline: false }
        ]
      });
      break;
    }

    default:
      // Return null for unhandled events
      return null;
  }

  return {
    message: { embeds },
    description,
    repoName,
  };
}
