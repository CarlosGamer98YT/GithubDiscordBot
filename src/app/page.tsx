'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';
import { WebhookLog, ChannelConfig } from '@/types';

interface Diagnostics {
  discordTokenSet: boolean;
  discordPublicKeySet: boolean;
  githubUsername: string | null;
  githubPatSet: boolean;
  channels: Array<{
    event: string;
    envVar: string;
    isConfigured: boolean;
    isUsingDefault?: boolean;
    valueMasked: string;
  }>;
}

export default function Home() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [testEvent, setTestEvent] = useState<string>('watch');
  const [sendingTest, setSendingTest] = useState<boolean>(false);
  const [syncingUser, setSyncingUser] = useState<boolean>(false);
  const [syncingCommands, setSyncingCommands] = useState<boolean>(false);
  const [activeModalLog, setActiveModalLog] = useState<WebhookLog | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string>('https://<your-vercel-domain>.vercel.app/api/webhook/github');
  
  // Custom notifications banner
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-generate webhook URL based on the current window hostname
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.origin;
      setWebhookUrl(`${host}/api/webhook/github`);
    }
  }, []);

  // Fetch logs and diagnostics
  const fetchStatus = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setDiagnostics(data.diagnostics || null);
      }
    } catch (e) {
      console.error('Failed to fetch status logs:', e);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Poll logs status every 5 seconds
  useEffect(() => {
    fetchStatus(true);
    const interval = setInterval(() => {
      fetchStatus(false);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Trigger test event
  const handleSendTest = async () => {
    setSendingTest(true);
    setNotification(null);
    try {
      const res = await fetch('/api/test-discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: testEvent }),
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setNotification({
          type: 'success',
          message: `Test event "${testEvent}" sent successfully to Discord!`
        });
        fetchStatus(false);
      } else {
        setNotification({
          type: 'error',
          message: `Failed to send test event: ${data.error || 'Unknown error'}`
        });
      }
    } catch (e: any) {
      setNotification({
        type: 'error',
        message: `Network error sending test: ${e.message || e}`
      });
    } finally {
      setSendingTest(false);
    }
  };

  // Synchronize user activity
  const handleSyncUser = async () => {
    setSyncingUser(true);
    setNotification(null);
    try {
      const res = await fetch('/api/sync-user', {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setNotification({
          type: 'success',
          message: `Sync complete! Forwarded ${data.count} new activity events to Discord.`
        });
        fetchStatus(false);
      } else {
        setNotification({
          type: 'error',
          message: `Sync failed: ${data.message || 'Unknown error'}`
        });
      }
    } catch (e: any) {
      setNotification({
        type: 'error',
        message: `Network error synchronizing: ${e.message || e}`
      });
    } finally {
      setSyncingUser(false);
    }
  };

  // Register Slash Commands manually
  const handleRegisterCommands = async () => {
    setSyncingCommands(true);
    setNotification(null);
    try {
      const res = await fetch('/api/register-commands', {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setNotification({
          type: 'success',
          message: 'Slash commands (/language, /ping) successfully registered globally!'
        });
      } else {
        setNotification({
          type: 'error',
          message: `Failed to register commands: ${data.error || 'Unknown error'}`
        });
      }
    } catch (e: any) {
      setNotification({
        type: 'error',
        message: `Network error: ${e.message || e}`
      });
    } finally {
      setSyncingCommands(false);
    }
  };

  // Copy helper
  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setNotification({
      type: 'success',
      message: 'Copied to clipboard!'
    });
  };

  const getEventNameDisplay = (event: string) => {
    switch (event) {
      case 'watch': return 'Star (watch)';
      case 'fork': return 'Fork';
      case 'issues': return 'Issues';
      case 'pull_request': return 'Pull Requests';
      case 'workflow_run': return 'GitHub Actions';
      case 'push': return 'Push (Merges)';
      case 'repository': return 'Repository Events';
      case 'repository_create': return 'Repo Created';
      case 'repository_delete': return 'Repo Deleted';
      default: return event;
    }
  };

  return (
    <div className={styles.container}>
      {/* Header Area */}
      <header className={styles.header}>
        <div className={styles.logoArea}>
          <span className={styles.logoIcon}>🤖</span>
          <div>
            <h1 className={styles.logoTitle}>GitCord Dashboard</h1>
            <p style={{ fontSize: '0.75rem', color: '#8b949e', marginTop: '0.1rem' }}>
              Vercel Serverless GitHub-to-Discord Integration
            </p>
          </div>
        </div>
        
        <div className={styles.statusIndicator}>
          <span className={styles.statusDot}></span>
          Bot Online (REST)
        </div>
      </header>

      {/* Grid Dashboard */}
      <div className={styles.dashboardGrid}>
        
        {/* Left Side: Diagnostics and Setup */}
        <div>
          {/* Environment Status Card */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              <span className={styles.cardIcon}>⚙️</span> System Config Status
            </h2>
            
            {loading && !diagnostics ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                <div className={styles.spinner}></div>
              </div>
            ) : diagnostics ? (
              <div className={styles.diagList}>
                <div className={styles.diagItem}>
                  <span className={styles.diagLabel}>Discord Bot Token</span>
                  <span className={`${styles.badge} ${diagnostics.discordTokenSet ? styles.badgeSuccess : styles.badgeError}`}>
                    {diagnostics.discordTokenSet ? 'Set' : 'Missing'}
                  </span>
                </div>

                <div className={styles.diagItem}>
                  <span className={styles.diagLabel}>Discord Public Key</span>
                  <span className={`${styles.badge} ${diagnostics.discordPublicKeySet ? styles.badgeSuccess : styles.badgeError}`}>
                    {diagnostics.discordPublicKeySet ? 'Set' : 'Missing'}
                  </span>
                </div>
                
                <div className={styles.diagItem}>
                  <span className={styles.diagLabel}>GitHub User Polling</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={styles.channelEnv}>@{diagnostics.githubUsername || 'disabled'}</span>
                    <span className={`${styles.badge} ${diagnostics.githubUsername ? styles.badgeSuccess : styles.badgeWarning}`}>
                      {diagnostics.githubUsername ? 'Enabled' : 'No username'}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: '1rem' }}>
                  <h3 style={{ fontSize: '0.9rem', color: '#e5e7eb', marginBottom: '0.5rem' }}>Channel Configurations</h3>
                  <div className={styles.channelGrid}>
                    {diagnostics.channels.map((chan, idx) => (
                      <div key={idx} className={styles.channelRow}>
                        <div className={styles.channelDetails}>
                          <span className={styles.channelName}>{getEventNameDisplay(chan.event)}</span>
                          <span className={styles.channelEnv}>{chan.envVar}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className={styles.channelValue}>{chan.valueMasked}</span>
                          <span className={`${styles.badge} ${chan.isConfigured ? styles.badgeSuccess : styles.badgeError}`}>
                            {chan.isConfigured ? 'Mapped' : 'Unmapped'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: '#ef4444' }}>Unable to retrieve environment diagnostics.</p>
            )}
          </section>

          {/* Webhook Setup Guide */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              <span className={styles.cardIcon}>📖</span> Repository Webhook Setup
            </h2>
            <div className={styles.stepList}>
              <div className={styles.stepItem}>
                <div className={styles.stepNumber}>1</div>
                <div className={styles.stepContent}>
                  <p className={styles.stepTitle}>Navigate to Repository Settings</p>
                  <p className={styles.stepDesc}>Go to your GitHub repository ➔ <b>Settings</b> ➔ <b>Webhooks</b> ➔ <b>Add Webhook</b>.</p>
                </div>
              </div>

              <div className={styles.stepItem}>
                <div className={styles.stepNumber}>2</div>
                <div className={styles.stepContent}>
                  <p className={styles.stepTitle}>Configure Payload URL</p>
                  <p className={styles.stepDesc}>Paste the Vercel deploy URL ending with the webhook route API endpoint:</p>
                  <div className={styles.codeBlock}>
                    <span style={{ overflowX: 'auto', marginRight: '0.5rem' }}>{webhookUrl}</span>
                    <button className={styles.copyButton} onClick={() => handleCopyText(webhookUrl)}>Copy</button>
                  </div>
                </div>
              </div>

              <div className={styles.stepItem}>
                <div className={styles.stepNumber}>3</div>
                <div className={styles.stepContent}>
                  <p className={styles.stepTitle}>Select Content Type & Events</p>
                  <p className={styles.stepDesc}>Set <b>Content type</b> to <code>application/json</code>.</p>
                  <p className={styles.stepDesc}>Under events trigger selection, choose <b>Let me select individual events</b> and check:</p>
                  <p style={{ fontSize: '0.8rem', color: '#a78bfa', fontFamily: 'monospace', lineHeight: '1.5' }}>
                    ✔ Stars (Watch)<br />
                    ✔ Forks<br />
                    ✔ Issues<br />
                    ✔ Pull Requests<br />
                    ✔ Workflow Runs (Actions)
                  </p>
                </div>
              </div>

              <div className={styles.stepItem}>
                <div className={styles.stepNumber}>4</div>
                <div className={styles.stepContent}>
                  <p className={styles.stepTitle}>Add Webhook</p>
                  <p className={styles.stepDesc}>Click <b>Add webhook</b> to save. GitHub will fire a ping event, which you will see recorded in the live logs!</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Side: Simulator and Logs */}
        <div>
          {/* Simulator & Actions */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              <span className={styles.cardIcon}>🧪</span> Interactive Testing Simulator
            </h2>
            
            <div className={styles.simControlGroup}>
              <p style={{ fontSize: '0.85rem', color: '#9ca3af', lineHeight: '1.4' }}>
                Simulate a GitHub webhook payload and route it directly to the designated Discord channel configured in your environment.
              </p>
              
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select 
                  className={styles.simSelect}
                  value={testEvent}
                  onChange={(e) => setTestEvent(e.target.value)}
                  style={{ flexGrow: 1 }}
                >
                  <option value="watch">🌟 Star Event (Started)</option>
                  <option value="fork">🍴 Fork Event</option>
                  <option value="issues">🐛 Issue Event (Opened)</option>
                  <option value="pull_request">🔀 Pull Request Event (Merged)</option>
                  <option value="workflow_run">✅ Action Run Event (Completed)</option>
                  <option value="push">🚀 Push Event</option>
                  <option value="repository_create">🆕 Repository Created Event</option>
                  <option value="repository_delete">🗑️ Repository Deleted Event</option>
                </select>

                <button 
                  className={styles.simButton}
                  onClick={handleSendTest}
                  disabled={sendingTest || !diagnostics?.discordTokenSet}
                >
                  {sendingTest ? (
                    <>
                      <div className={styles.spinner}></div> Sending...
                    </>
                  ) : (
                    'Send Test'
                  )}
                </button>
              </div>

              {diagnostics?.githubUsername && (
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                  <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
                    Sync user activity done by <b>@{diagnostics.githubUsername}</b> on other GitHub repositories.
                  </p>
                  <button 
                    className={styles.syncButton}
                    onClick={handleSyncUser}
                    disabled={syncingUser}
                    style={{ width: '100%' }}
                  >
                    {syncingUser ? (
                      <>
                        <div className={styles.spinner}></div> Syncing with GitHub...
                      </>
                    ) : (
                      <>🔄 Sync User Activity</>
                    )}
                  </button>
                </div>
              )}

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
                  Register and sync Discord slash commands (<code>/ping</code>, <code>/language</code>) on your Discord Application.
                </p>
                <button 
                  className={styles.syncButton}
                  onClick={handleRegisterCommands}
                  disabled={syncingCommands || !diagnostics?.discordTokenSet}
                  style={{ width: '100%', backgroundColor: '#4f46e5', borderColor: '#4338ca' }}
                >
                  {syncingCommands ? (
                    <>
                      <div className={styles.spinner}></div> Syncing commands...
                    </>
                  ) : (
                    <>⚡ Sync Discord Commands</>
                  )}
                </button>
              </div>

              {/* Status Banner */}
              {notification && (
                <div className={`${styles.notificationArea} ${notification.type === 'success' ? styles.alertSuccess : styles.alertError}`}>
                  {notification.message}
                </div>
              )}
            </div>
          </section>

          {/* Activity Logs Card */}
          <section className={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f3f4f6', margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span className={styles.cardIcon}>📋</span> Session Activity Logs
              </h2>
              <button 
                onClick={() => fetchStatus(true)}
                style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
              >
                Refresh
              </button>
            </div>

            {loading && logs.length === 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
                <div className={styles.spinner}></div>
              </div>
            ) : logs.length === 0 ? (
              <div className={styles.logEmpty}>
                No webhook events received in this server session yet.<br />
                <span style={{ fontSize: '0.75rem', color: '#4b5563', display: 'block', marginTop: '0.5rem' }}>
                  Trigger a test event or configure GitHub webhook settings to see logs appear.
                </span>
              </div>
            ) : (
              <div className={styles.logsList}>
                {logs.map((log) => (
                  <div 
                    key={log.id} 
                    className={styles.logCard}
                    onClick={() => setActiveModalLog(log)}
                  >
                    <div className={styles.logHeader}>
                      <span className={styles.logTypeBadge}>{log.eventType}</span>
                      <span className={styles.logTime}>
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    
                    <p className={styles.logDesc}>
                      <strong>{log.sender}</strong> {log.description}
                    </p>

                    <div className={styles.logMeta}>
                      <span className={styles.logRepo}>📦 {log.repository}</span>
                      <span className={log.status === 'success' ? styles.badgeSuccess : styles.badgeError} style={{ fontSize: '0.65rem', padding: '0.05rem 0.35rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                        {log.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Log Details Modal */}
      {activeModalLog && (
        <div className={styles.detailsModalOverlay} onClick={() => setActiveModalLog(null)}>
          <div className={styles.detailsModal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => setActiveModalLog(null)}>✕</button>
            
            <h3 className={styles.modalTitle}>
              🔍 Webhook Event Details
            </h3>

            <div className={styles.modalField}>
              <div className={styles.modalFieldLabel}>Event ID</div>
              <div className={styles.modalFieldValue} style={{ fontFamily: 'monospace' }}>{activeModalLog.id}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className={styles.modalField}>
                <div className={styles.modalFieldLabel}>Event Type</div>
                <div className={styles.modalFieldValue}>
                  <span className={styles.logTypeBadge}>{activeModalLog.eventType}</span>
                </div>
              </div>
              
              <div className={styles.modalField}>
                <div className={styles.modalFieldLabel}>Processed At</div>
                <div className={styles.modalFieldValue}>
                  {new Date(activeModalLog.timestamp).toLocaleString()}
                </div>
              </div>
            </div>

            <div className={styles.modalField}>
              <div className={styles.modalFieldLabel}>Repository</div>
              <div className={styles.modalFieldValue} style={{ fontWeight: 600 }}>{activeModalLog.repository}</div>
            </div>

            <div className={styles.modalField}>
              <div className={styles.modalFieldLabel}>Trigger Sender</div>
              <div className={styles.modalFieldValue}>{activeModalLog.sender}</div>
            </div>

            <div className={styles.modalField}>
              <div className={styles.modalFieldLabel}>Description</div>
              <div className={styles.modalFieldValue} style={{ color: '#fff', fontSize: '0.95rem' }}>{activeModalLog.description}</div>
            </div>

            <div className={styles.modalField}>
              <div className={styles.modalFieldLabel}>Delivery Status</div>
              <div className={styles.modalFieldValue}>
                <span className={`${styles.badge} ${activeModalLog.status === 'success' ? styles.badgeSuccess : styles.badgeError}`}>
                  {activeModalLog.status}
                </span>
              </div>
            </div>

            <div className={styles.modalField}>
              <div className={styles.modalFieldLabel}>Processing Details</div>
              <div className={styles.modalCode}>{activeModalLog.details}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
