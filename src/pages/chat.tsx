import React, { useEffect, useState } from 'react';
import { supabase, getAccessToken } from '../lib/supabaseClient';
import {
  listConversations,
  createConversation,
  renameConversation,
  archiveConversation,
  deleteConversation,
  listMessages,
  sendMessage,
  streamMessage,
  Conversation,
  Message,
} from '../lib/chatApi';

export default function ChatPage() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [useStream, setUseStream] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => {
    // Handle magic-link hash tokens and set session
    try {
      const hash = window.location.hash.slice(1);
      if (hash) {
        const p = new URLSearchParams(hash);
        const access_token = p.get('access_token');
        const refresh_token = p.get('refresh_token');
        if (access_token && refresh_token) {
          supabase.auth.setSession({ access_token, refresh_token }).finally(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
          });
        }
      }
    } catch {}
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token || null;
        const email = data?.session?.user?.email || null;
        setAccessToken(token);
        setUserEmail(email);
        if (token) {
          const convs = await listConversations(token);
          setConversations(convs);
          if (convs.length > 0) {
            const id = convs[0].id;
            setActiveId(id);
            const msgs = await listMessages(token, id);
            setMessages(msgs);
          }
        }
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = async () => {
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/chat` },
      });
      if (error) throw error;
      alert('Magic link sent. Check your email.');
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const ensureToken = async () => {
    try {
      const t = await getAccessToken();
      setAccessToken(t);
      return t;
    } catch (e: any) {
      setError('Session expired. Please sign in again.');
      setAccessToken(null);
      throw e;
    }
  };

  const onSelectConversation = async (id: string) => {
    if (!accessToken) return;
    setActiveId(id);
    setLoading(true);
    try {
      const msgs = await listMessages(accessToken, id);
      setMessages(msgs);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const onCreateConversation = async () => {
    const token = accessToken || await ensureToken();
    setLoading(true);
    try {
      const conv = await createConversation(token);
      const convs = await listConversations(token);
      setConversations(convs);
      setActiveId(conv.id);
      const msgs = await listMessages(token, conv.id);
      setMessages(msgs);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const onSend = async () => {
    if (!input.trim() || !activeId) return;
    const token = accessToken || await ensureToken();
    setError(null);
    setStreaming(true);
    try {
      // optimistic user message
      const userMsg: Message = { id: Date.now(), role: 'user', is_final: true, content: { type: 'text', value: input } };
      setMessages(prev => [...prev, userMsg]);
      setInput('');

      if (useStream) {
        // streaming assistant bubble
        let acc = '';
        const provisionalId = Date.now() + 1;
        setMessages(prev => [...prev, { id: provisionalId, role: 'assistant', is_final: false, content: { type: 'text', value: '' } }]);

        await streamMessage(token, { conversationId: activeId, message: userMsg.content.value }, (chunk) => {
          acc += chunk;
          setMessages(prev => prev.map(m => m.id === provisionalId ? { ...m, content: { type: 'text', value: acc } } : m));
        });

        // finalize
        setMessages(prev => prev.map(m => m.id === provisionalId ? { ...m, is_final: true } : m));
      } else {
        // non-streaming path
        const assistant = await sendMessage(token, { conversationId: activeId, message: userMsg.content.value });
        setMessages(prev => [...prev, assistant]);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setStreaming(false);
    }
  };

  if (!accessToken) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Sign in</h2>
        <input placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
        <button onClick={signIn}>Send Magic Link</button>
        {error && <div style={{ color: 'red' }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      {/* Sidebar toggle */}
      {showSidebar && (
      <div style={{ width: 280, borderRight: '1px solid #eee', padding: 12, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Conversations</h3>
          <button onClick={onCreateConversation}>+</button>
        </div>
        {loading && <div>Loading…</div>}
        {conversations.length === 0 && <div>Empty</div>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {conversations.map(c => (
            <li key={c.id} style={{ marginBottom: 8 }}>
              <button style={{ width: '100%', textAlign: 'left', background: c.id === activeId ? '#f5f5f5' : 'transparent' }} onClick={() => onSelectConversation(c.id)}>
                {c.title || 'Untitled'}
              </button>
            </li>
          ))}
        </ul>
      </div>
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 10, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <button onClick={() => setShowSidebar(s => !s)}>{showSidebar ? 'Hide' : 'Show'} History</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {userEmail && <span style={{ fontSize: 12, color: '#666', border: '1px solid #ddd', padding: '2px 6px', borderRadius: 10 }}>{userEmail} • logged in</span>}
            <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}>Sign out</button>
          </div>
        </div>
        <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
          {messages.map(m => (
            <div key={m.id} style={{ margin: '8px 0' }}>
              <strong>{m.role}:</strong> <span>{m.content.value}</span>
            </div>
          ))}
          {error && <div style={{ color: 'red' }}>{error}</div>}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid #eee', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input style={{ flex: 1 }} value={input} onChange={e => setInput(e.target.value)} placeholder={streaming ? 'Streaming…' : 'Type a message'} disabled={streaming} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={useStream} onChange={e => setUseStream(e.target.checked)} /> Stream
          </label>
          <button onClick={onSend} disabled={streaming}>Send</button>
        </div>
      </div>
    </div>
  );
}




