import { NextRequest, NextResponse } from 'next/server';
import { registerSlashCommands } from '@/lib/discord';
import { logSystem } from '@/lib/console-hook';

export async function POST(request: NextRequest) {
  try {
    await logSystem('log', '[Commands Registrar] Initiating manual slash commands registration...');
    const result = await registerSlashCommands();

    if (result.success) {
      await logSystem('log', '✅ [Commands Registrar] Slash commands (/language, /ping) successfully registered.');
      return NextResponse.json({ success: true, message: 'Slash commands successfully registered globally.' });
    } else {
      await logSystem('error', `❌ [Commands Registrar] Failed to register commands: ${result.error}`);
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
  } catch (err: any) {
    await logSystem('error', `❌ [Commands Registrar] Exception during registration: ${err.message || err}`);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
