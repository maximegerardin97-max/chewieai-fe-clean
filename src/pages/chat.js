import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { supabase, getAccessToken } from '../lib/supabaseClient';
import { listConversations, createConversation, listMessages, sendMessage, streamMessage, } from '../lib/chatApi';
export default function ChatPage() {
    const [accessToken, setAccessToken] = useState(null);
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [userEmail, setUserEmail] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [messages, setMessages] = useState([]);
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
        }
        catch { }
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
            }
            catch (e) {
                setError(e?.message || String(e));
            }
            finally {
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
            if (error)
                throw error;
            alert('Magic link sent. Check your email.');
        }
        catch (e) {
            setError(e?.message || String(e));
        }
    };
    const ensureToken = async () => {
        try {
            const t = await getAccessToken();
            setAccessToken(t);
            return t;
        }
        catch (e) {
            setError('Session expired. Please sign in again.');
            setAccessToken(null);
            throw e;
        }
    };
    const onSelectConversation = async (id) => {
        if (!accessToken)
            return;
        setActiveId(id);
        setLoading(true);
        try {
            const msgs = await listMessages(accessToken, id);
            setMessages(msgs);
        }
        catch (e) {
            setError(e?.message || String(e));
        }
        finally {
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
        }
        catch (e) {
            setError(e?.message || String(e));
        }
        finally {
            setLoading(false);
        }
    };
    const onSend = async () => {
        if (!input.trim() || !activeId)
            return;
        const token = accessToken || await ensureToken();
        setError(null);
        setStreaming(true);
        try {
            // optimistic user message
            const userMsg = { id: Date.now(), role: 'user', is_final: true, content: { type: 'text', value: input } };
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
            }
            else {
                // non-streaming path
                const assistant = await sendMessage(token, { conversationId: activeId, message: userMsg.content.value });
                setMessages(prev => [...prev, assistant]);
            }
        }
        catch (e) {
            setError(e?.message || String(e));
        }
        finally {
            setStreaming(false);
        }
    };
    if (!accessToken) {
        return (_jsxs("div", { style: { padding: 16 }, children: [_jsx("h2", { children: "Sign in" }), _jsx("input", { placeholder: "email", value: email, onChange: e => setEmail(e.target.value) }), _jsx("button", { onClick: signIn, children: "Send Magic Link" }), error && _jsx("div", { style: { color: 'red' }, children: error })] }));
    }
    return (_jsxs("div", { style: { display: 'flex', height: '100vh', fontFamily: 'sans-serif' }, children: [showSidebar && (_jsxs("div", { style: { width: 280, borderRight: '1px solid #eee', padding: 12, overflowY: 'auto' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("h3", { children: "Conversations" }), _jsx("button", { onClick: onCreateConversation, children: "+" })] }), loading && _jsx("div", { children: "Loading\u2026" }), conversations.length === 0 && _jsx("div", { children: "Empty" }), _jsx("ul", { style: { listStyle: 'none', padding: 0 }, children: conversations.map(c => (_jsx("li", { style: { marginBottom: 8 }, children: _jsx("button", { style: { width: '100%', textAlign: 'left', background: c.id === activeId ? '#f5f5f5' : 'transparent' }, onClick: () => onSelectConversation(c.id), children: c.title || 'Untitled' }) }, c.id))) })] })), _jsxs("div", { style: { flex: 1, display: 'flex', flexDirection: 'column' }, children: [_jsxs("div", { style: { padding: 10, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("div", { children: _jsxs("button", { onClick: () => setShowSidebar(s => !s), children: [showSidebar ? 'Hide' : 'Show', " History"] }) }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [userEmail && _jsxs("span", { style: { fontSize: 12, color: '#666', border: '1px solid #ddd', padding: '2px 6px', borderRadius: 10 }, children: [userEmail, " \u2022 logged in"] }), _jsx("button", { onClick: async () => { await supabase.auth.signOut(); window.location.reload(); }, children: "Sign out" })] })] }), _jsxs("div", { style: { flex: 1, padding: 16, overflowY: 'auto' }, children: [messages.map(m => (_jsxs("div", { style: { margin: '8px 0' }, children: [_jsxs("strong", { children: [m.role, ":"] }), " ", _jsx("span", { children: m.content.value })] }, m.id))), error && _jsx("div", { style: { color: 'red' }, children: error })] }), _jsxs("div", { style: { padding: 12, borderTop: '1px solid #eee', display: 'flex', gap: 8, alignItems: 'center' }, children: [_jsx("input", { style: { flex: 1 }, value: input, onChange: e => setInput(e.target.value), placeholder: streaming ? 'Streaming…' : 'Type a message', disabled: streaming }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx("input", { type: "checkbox", checked: useStream, onChange: e => setUseStream(e.target.checked) }), " Stream"] }), _jsx("button", { onClick: onSend, disabled: streaming, children: "Send" })] })] })] }));
}
