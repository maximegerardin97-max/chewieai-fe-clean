import { supabase } from './supabaseClient';

export type Conversation = {
  id: string;
  title?: string | null;
  page_name?: string | null;
  updated_at: string;
  archived: boolean;
};

export type Message = {
  id: number;
  role: 'user'|'assistant'|'system';
  is_final: boolean;
  chunk_index?: number | null;
  content: { type: 'text'; value: string };
};

const BASE_URL = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BACKEND_URL)
  ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api`
  : `${window.location.origin.replace('5173', '3000')}/api`;

async function doFetch(path: string, accessToken: string, init?: RequestInit) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    const err = new Error(txt || `HTTP ${resp.status}`);
    (err as any).status = resp.status;
    throw err;
  }
  return resp;
}

export async function listConversations(accessToken: string): Promise<Conversation[]> {
  const r = await doFetch('/conversations', accessToken, { method: 'GET' });
  const data = await r.json();
  return data.conversations || [];
}

export async function createConversation(accessToken: string): Promise<Conversation> {
  const r = await doFetch('/conversations', accessToken, { method: 'POST', body: JSON.stringify({}) });
  const data = await r.json();
  return data.conversation;
}

export async function renameConversation(accessToken: string, id: string, title: string): Promise<Conversation> {
  const r = await doFetch(`/conversations/${encodeURIComponent(id)}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ title }),
  });
  return r.json();
}

export async function archiveConversation(accessToken: string, id: string, archived: boolean): Promise<{ ok: true }> {
  const r = await doFetch(`/conversations/${encodeURIComponent(id)}/archive`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ archived }),
  });
  return r.json();
}

export async function deleteConversation(accessToken: string, id: string): Promise<{ ok: true }> {
  const r = await doFetch(`/conversations/${encodeURIComponent(id)}`, accessToken, { method: 'DELETE' });
  return r.json();
}

export async function listMessages(accessToken: string, conversationId: string): Promise<Message[]> {
  // Get user from session to ensure proper filtering
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Query messages directly from Supabase
  const { data: messages } = await supabase
    .from('messages')
    .select('id, role, content, is_final, chunk_index, created_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (!messages) {
    return [];
  }

  return messages;
}

export async function sendMessage(accessToken: string, params: { conversationId: string; message: string; provider?: string; model?: string; }): Promise<Message> {
  const r = await doFetch(`/messages`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ conversation_id: params.conversationId, message: params.message, provider: params.provider, model: params.model }),
  });
  const data = await r.json();
  return data.message;
}

export async function streamMessage(
  accessToken: string,
  params: { conversationId: string; message: string; provider?: string; model?: string; },
  onChunk?: (chunk: string) => void,
  onDone?: () => void
): Promise<void> {
  const resp = await doFetch(`/messages/stream`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ conversation_id: params.conversationId, message: params.message, provider: params.provider, model: params.model }),
  });
  const reader = resp.body?.getReader();
  if (!reader) { if (onDone) onDone(); return; }
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Parse SSE lines: split on double newlines
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = chunk.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice('data:'.length).trim();
        if (!payload) continue;
        try {
          const obj = JSON.parse(payload);
          if (obj.type === 'chunk' && obj.content && onChunk) onChunk(obj.content);
          if (obj.type === 'done' && onDone) onDone();
        } catch {
          // Fallback: if backend sent plain text, stream as-is
          if (onChunk) onChunk(payload);
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  if (onDone) onDone();
}




