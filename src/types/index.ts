export interface WebhookLog {
  id: string;
  timestamp: string;
  eventType: string;
  repository: string;
  sender: string;
  description: string;
  status: 'success' | 'error' | 'pending';
  details: string;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  footer?: {
    text: string;
    icon_url?: string;
  };
  thumbnail?: {
    url: string;
  };
  image?: {
    url: string;
  };
  author?: {
    name: string;
    url?: string;
    icon_url?: string;
  };
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

export interface ChannelConfig {
  key: string;
  name: string;
  envVar: string;
  value: string;
  isConfigured: boolean;
  events: string[];
}
