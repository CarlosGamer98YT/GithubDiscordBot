import { NextRequest, NextResponse } from 'next/server';
import { sendToDiscord, addLog } from '@/lib/discord';
import { DiscordMessage } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { eventType } = await request.json();
    
    if (!eventType) {
      return NextResponse.json({ error: 'Missing eventType' }, { status: 400 });
    }

    const mockSender = 'test-developer';
    const mockRepo = 'my-awesome-repo';
    const timestamp = new Date().toISOString();

    let title = '';
    let description = '';
    let color = 3447003; // default blue
    let fields: any[] = [];

    const baseEmbed = {
      timestamp,
      footer: {
        text: 'Discord Bot Test Simulator',
        icon_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
      },
      author: {
        name: mockSender,
        url: `https://github.com/${mockSender}`,
        icon_url: 'https://avatars.githubusercontent.com/u/9919?v=4',
      },
    };

    switch (eventType) {
      case 'watch':
        title = '🌟 Repository Starred! (TEST)';
        description = `[**${mockSender}**](https://github.com/${mockSender}) starred [**${mockRepo}**](https://github.com/${mockSender}/${mockRepo})`;
        color = 16772864; // Gold
        fields = [
          { name: 'Repository', value: `[${mockRepo}](https://github.com/${mockSender}/${mockRepo})`, inline: true },
          { name: 'Total Stars', value: '42', inline: true }
        ];
        break;
      case 'fork':
        const forkee = 'my-forked-repo';
        title = '🍴 Repository Forked! (TEST)';
        description = `[**${mockSender}**](https://github.com/${mockSender}) forked [**${mockRepo}**](https://github.com/${mockSender}/${mockRepo})\ninto [**${forkee}**](https://github.com/${mockSender}/${forkee})`;
        color = 3447003; // Blue
        fields = [
          { name: 'Source Repository', value: `[${mockRepo}](https://github.com/${mockSender}/${mockRepo})`, inline: true },
          { name: 'Forked Repository', value: `[${forkee}](https://github.com/${mockSender}/${forkee})`, inline: true }
        ];
        break;
      case 'issues':
        title = '🐛 Issue #101 OPENED (TEST)';
        description = `**[Crash on startup in production]**\n\nApp fails to initialize when environmental variables are not loaded properly. Need to add a fallback check.`;
        color = 15158332; // Red
        fields = [
          { name: 'Repository', value: `[${mockRepo}](https://github.com/${mockSender}/${mockRepo})`, inline: true },
          { name: 'Author', value: `[${mockSender}](https://github.com/${mockSender})`, inline: true }
        ];
        break;
      case 'pull_request':
        title = '🔀 Pull Request #22 MERGED (TEST)';
        description = `**[Feature/auth: Implement Discord OAuth login flow]**\n\nThis pull request adds support for user authentications via Discord client.`;
        color = 3066993; // Green
        fields = [
          { name: 'Repository', value: `[${mockRepo}](https://github.com/${mockSender}/${mockRepo})`, inline: true },
          { name: 'Creator', value: `[${mockSender}](https://github.com/${mockSender})`, inline: true },
          { name: 'Branches', value: '`feature/auth` ➔ `main`', inline: false }
        ];
        break;
      case 'workflow_run':
        title = '✅ Workflow Run SUCCESS (TEST)';
        description = `Workflow **Continuous Integration** (run #35) completed with status **success**`;
        color = 3066993; // Green
        fields = [
          { name: 'Repository', value: `[${mockRepo}](https://github.com/${mockSender}/${mockRepo})`, inline: true },
          { name: 'Trigger Event', value: '`push`', inline: true },
          { name: 'Commit Message', value: 'feat: add discord notifications', inline: false }
        ];
        break;
      case 'push':
        title = '🚀 Commits Pushed (TEST)';
        description = `[**${mockSender}**](https://github.com/${mockSender}) pushed 3 commit(s) to branch \`main\``;
        color = 3447003; // Blue
        fields = [
          { name: 'Repository', value: `[${mockRepo}](https://github.com/${mockSender}/${mockRepo})`, inline: true },
          { name: 'Commits Count', value: '3', inline: true },
          { name: 'Head Commit Message', value: 'feat: add support for push events', inline: false }
        ];
        break;
      default:
        return NextResponse.json({ error: 'Unsupported test event type' }, { status: 400 });
    }

    const discordMessage: DiscordMessage = {
      embeds: [
        {
          ...baseEmbed,
          title,
          description,
          color,
          fields
        }
      ]
    };

    const result = await sendToDiscord(eventType, discordMessage);

    if (result.success) {
      addLog({
        eventType: `${eventType}-test`,
        repository: mockRepo,
        sender: mockSender,
        description: `Triggered manual test for event: "${eventType}"`,
        status: 'success',
        details: `Test embed delivered to Discord. Channel ID: ${result.channelId}`
      });
      return NextResponse.json({ success: true, channelId: result.channelId }, { status: 200 });
    } else {
      addLog({
        eventType: `${eventType}-test`,
        repository: mockRepo,
        sender: mockSender,
        description: `Triggered manual test for event: "${eventType}" (FAILED)`,
        status: 'error',
        details: `Failed to deliver test embed. Channel ID: ${result.channelId || 'none'}. Error: ${result.error}`
      });
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Test endpoint error:', error);
    return NextResponse.json({ error: error.message || 'System error' }, { status: 500 });
  }
}
