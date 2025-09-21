// Simple Design Rating App 
const COMMAND_RE = /command\s*:?\s*send\s+([a-z0-9.]+)\s+(.+)/i;

// ------------------------------------------------------------
// Simplified frontend - backend handles all mapping now
// ------------------------------------------------------------

// Backend now handles all mapping - no need for frontend mapping

// Small synonyms pass to make it more tolerant

class DesignRatingApp {
    constructor() {
        const cfg = (window && window.AGENT_CFG) ? window.AGENT_CFG : {};
        this.supabaseUrl = cfg.SUPABASE_URL || '';
        this.supabaseKey = cfg.SUPABASE_ANON || '';
        this.chatUrl = cfg.CHAT_URL || '';
        this.backendUrl = "https://iiolvvdnzrfcffudwocp.supabase.co/functions/v1/llm-proxy-auth";
        this.supabaseClient = null;
        this.accessToken = null;
        this.userEmail = null;
        this.currentConversationId = null;
        this.uploadedImages = [];
        this.isProcessing = false;
        this.currentCardId = 1;
        this.cardData = new Map(); // Store data for each card
        
        // Conversation context management
        this.conversationHistory = new Map(); // cardId -> conversation history
        this.mainChatHistory = []; // Centralized main chat history
        this.chatMemory = []; // last 10 turns (20 messages)

        // Shared settings from LLM Proxy - loaded from app_settings
        this.currentProvider = null; // Will be loaded from app_settings
        this.currentModel = null; // Will be loaded from app_settings
        this.currentSystemPrompt = null;
        
        // Loading messages for creative feedback
        this.loadingMessages = [
            "Looking into our infinite design knowledge",
            "Coming up with the next Facebook",
            "Looking into renaissance paintings for inspiration"
        ];
        this.currentLoadingIndex = 0;
        this.loadingInterval = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.initializeCard(1); // Initialize the first card
        this.initSupabase();
        this.initAuthModal();
        
        // Force-hide left rating panel from the start
        const feedbackCard = document.getElementById('feedbackCard');
        if (feedbackCard) feedbackCard.style.display = 'none';
        
        // Load shared settings on start
        this.loadSharedSettings().then((s) => {
            if (s) {
                this.currentProvider = s.provider;
                this.currentModel = s.model;
                this.currentSystemPrompt = s.systemPrompt;
            }
        }).catch(console.error);
        // Refresh settings when window regains focus
        window.addEventListener('focus', () => {
            this.loadSharedSettings().then((s) => {
                if (s) {
                    this.currentProvider = s.provider;
                    this.currentModel = s.model;
                    this.currentSystemPrompt = s.systemPrompt;
                }
            }).catch(console.error);
        });
    }

    async initSupabase() {
        if (!this.supabaseUrl || !this.supabaseKey) return;
        
        // Initialize Supabase client
        this.supabaseClient = window.supabase.createClient(this.supabaseUrl, this.supabaseKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
            },
        });
        
        // Handle magic link redirect
        try {
            const hash = window.location.hash.slice(1);
            if (hash) {
                const p = new URLSearchParams(hash);
                const access_token = p.get('access_token');
                const refresh_token = p.get('refresh_token');
                if (access_token && refresh_token) {
                    await this.supabaseClient.auth.setSession({ access_token, refresh_token });
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            }
        } catch {}
        
        // Check for existing session
        const { data } = await this.supabaseClient.auth.getSession();
        if (data?.session) {
            this.accessToken = data.session.access_token;
            this.userEmail = data.session.user?.email;
            this.updateAuthUI();
        }
        
        // Listen for auth changes
        this.supabaseClient.auth.onAuthStateChange((_event, session) => {
            if (session) {
                this.accessToken = session.access_token;
                this.userEmail = session.user?.email;
                this.updateAuthUI();
            } else {
                this.accessToken = null;
                this.userEmail = null;
                this.updateAuthUI();
            }
        });
    }

    updateAuthUI() {
        const authContainer = document.getElementById('authContainer');
        if (!authContainer) return;
        
        if (this.userEmail) {
            authContainer.innerHTML = `
                <span style="font-size: 12px; color: #666; border: 1px solid #ddd; padding: 2px 6px; border-radius: 10px;">
                    ${this.userEmail} • logged in
                </span>
                <button onclick="app.signOut()" style="margin-left: 8px; padding: 4px 8px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">Sign out</button>
            `;
            // Hide the modal if user is signed in
            this.hideAuthModal();
        } else {
            // Hide the small auth field and show the modal instead
            authContainer.innerHTML = '';
            this.showAuthModal();
        }
    }

    async signIn() {
        const emailInput = document.getElementById('emailInput');
        const email = emailInput?.value?.trim();
        if (!email) return alert('Please enter an email');
        
        try {
            const { error } = await this.supabaseClient.auth.signInWithOtp({
                email,
                options: { 
                    emailRedirectTo: window.location.hostname === 'maximegerardin97-max.github.io'
                        ? 'https://maximegerardin97-max.github.io/chewieai-fe-clean'
                        : `${window.location.origin}` 
                },
            });
            if (error) throw error;
            alert('Magic link sent. Check your email.');
        } catch (e) {
            alert('Sign in failed: ' + e.message);
        }
    }

    async signOut() {
        await this.supabaseClient.auth.signOut();
        window.location.reload();
    }

    initAuthModal() {
        const modal = document.getElementById('authModal');
        const closeBtn = document.getElementById('authModalClose');
        const submitBtn = document.getElementById('authEmailSubmit');
        const emailInput = document.getElementById('authEmailInput');
        if (closeBtn) closeBtn.addEventListener('click', () => this.hideAuthModal());
        if (modal) modal.addEventListener('click', (e) => {
            if (e.target === modal) this.hideAuthModal();
        });
        if (submitBtn) submitBtn.addEventListener('click', async () => {
            const email = emailInput?.value?.trim();
            if (!email) { emailInput?.focus(); return; }
            try {
                const { error } = await this.supabaseClient.auth.signInWithOtp({
                    email,
                    options: { 
                        emailRedirectTo: window.location.hostname === 'maximegerardin97-max.github.io'
                            ? 'https://maximegerardin97-max.github.io/chewieai-fe-clean'
                            : `${window.location.origin}` 
                    },
                });
                if (error) throw error;
                submitBtn.textContent = 'Link sent ✅';
                setTimeout(() => this.hideAuthModal(), 800);
            } catch (e) {
                submitBtn.textContent = 'Send magic link';
                alert('Sign in failed: ' + (e?.message || 'Unknown error'));
            }
        });
    }

    showAuthModal() {
        const modal = document.getElementById('authModal');
        const input = document.getElementById('authEmailInput');
        if (!modal) return;
        modal.style.display = 'flex';
        setTimeout(() => input && input.focus(), 0);
    }

    hideAuthModal() {
        const modal = document.getElementById('authModal');
        if (!modal) return;
        modal.style.display = 'none';
    }

    async signOut() {
        if (this.supabaseClient) {
            await this.supabaseClient.auth.signOut();
        }
        this.accessToken = null;
        this.userEmail = null;
        this.currentConversationId = null;
        this.updateAuthUI();
    }

    async loadSharedSettings() {
        if (!this.accessToken) return null;
        try {
            const resp = await fetch(`${this.backendUrl}/settings`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });
            if (!resp.ok) {
                console.warn('loadSharedSettings failed', resp.status);
                return null;
            }
            const data = await resp.json();
            return {
                systemPrompt: data.system_prompt || '',
                provider: data.provider || '',
                model: data.model || ''
            };
        } catch (error) {
            console.warn('loadSharedSettings error:', error);
            return null;
        }
    }

    appendHistory(userText, assistantText) {
        if (!userText && !assistantText) return;
        if (userText) this.chatMemory.push({ role: 'user', content: userText });
        if (assistantText) this.chatMemory.push({ role: 'assistant', content: assistantText });
        // Keep last 20 messages (10 turns)
        if (this.chatMemory.length > 20) {
            this.chatMemory = this.chatMemory.slice(-20);
        }
    }

    getLastHistory(limit = 20) {
        return this.chatMemory.slice(-limit);
    }

    getAuthHeaders() {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }
        console.log('[AUTH] Using token:', this.accessToken.substring(0, 20) + '...');
        console.log('[AUTH] Token length:', this.accessToken.length);
        console.log('[AUTH] Token starts with:', this.accessToken.substring(0, 10));
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.accessToken}`
        };
    }

    async testJWTToken() {
        if (!this.accessToken) return false;
        try {
            const resp = await fetch(`${this.backendUrl}/test`, {
                headers: this.getAuthHeaders()
            });
            console.log('[JWT TEST] Response status:', resp.status);
            return resp.ok;
        } catch (e) {
            console.log('[JWT TEST] Error:', e.message);
            return false;
        }
    }

    async compressMultimodalMessage(message) {
        console.log('[COMPRESS] Starting compression of message with', message.length, 'parts');
        const compressed = [];
        
        for (let i = 0; i < message.length; i++) {
            const part = message[i];
            console.log(`[COMPRESS] Processing part ${i}:`, part.type);
            
            if (part.type === 'image_url' && part.image_url?.url) {
                try {
                    console.log('[COMPRESS] Compressing image, original size:', part.image_url.url.length);
                    // Compress the image
                    const compressedImage = await this.compressImage(part.image_url.url);
                    console.log('[COMPRESS] Image compressed, new size:', compressedImage.length);
                    compressed.push({
                        type: 'image_url',
                        image_url: { url: compressedImage }
                    });
                } catch (error) {
                    console.error('[COMPRESS] Image compression failed:', error);
                    // Fallback to original image
                    compressed.push(part);
                }
            } else {
                console.log('[COMPRESS] Keeping non-image part as-is');
                compressed.push(part);
            }
        }
        
        console.log('[COMPRESS] Compression complete, returning', compressed.length, 'parts');
        return compressed;
    }

    async compressImage(dataUrl, maxWidth = 512, quality = 0.6) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Calculate new dimensions - more aggressive compression
                let { width, height } = img;
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);
                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                
                console.log(`Image compressed: ${dataUrl.length} -> ${compressedDataUrl.length} bytes`);
                resolve(compressedDataUrl);
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }


    async createConversation() {
        if (!this.accessToken) { this.showAuthModal(); throw new Error('Please sign in first'); }
        const resp = await fetch(`${this.backendUrl}/conversations`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({})
        });
        if (!resp.ok) throw new Error(`Create conversation failed: ${resp.status}`);
        const data = await resp.json();
        return data.conversation;
    }

    async loadConversations() {
        if (!this.accessToken) { this.showAuthModal(); return []; }
        const resp = await fetch(`${this.backendUrl}/conversations`, {
            headers: this.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(`Load conversations failed: ${resp.status}`);
        const data = await resp.json();
        return data.conversations || [];
    }

    async loadMessages(conversationId) {
        if (!this.accessToken) { this.showAuthModal(); return []; }
        
        // Get user from session to ensure proper filtering
        const { data: { user } } = await this.supabaseClient.auth.getUser();
        if (!user) {
            throw new Error('User not authenticated');
        }

        // Query messages directly from Supabase
        const { data: messages, error } = await this.supabaseClient
            .from('messages')
            .select('id, role, content, is_final, chunk_index, created_at')
            .eq('conversation_id', conversationId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });

        console.log('[MESSAGES] Supabase response:', { messages, error, type: typeof messages, isArray: Array.isArray(messages) });

        if (error) {
            console.error('[MESSAGES] Supabase error:', error);
            return [];
        }

        if (!messages || !Array.isArray(messages)) {
            console.warn('[MESSAGES] No messages or not an array:', messages);
            return [];
        }

        return messages;
    }

    async loadKnowledgeBase() {
        if (!this.accessToken) { this.showAuthModal(); return []; }
        try {
            const resp = await fetch(`${this.backendUrl}/knowledge`, {
                headers: this.getAuthHeaders()
            });
            if (!resp.ok) throw new Error(`Load knowledge base failed: ${resp.status}`);
            const data = await resp.json();
            return data || [];
        } catch (error) {
            console.error('Knowledge base error:', error);
            return [];
        }
    }

    async loadStats() {
        if (!this.accessToken) { this.showAuthModal(); return null; }
        try {
            const resp = await fetch(`${this.backendUrl}/stats`, {
                headers: this.getAuthHeaders()
            });
            if (!resp.ok) throw new Error(`Load stats failed: ${resp.status}`);
            const data = await resp.json();
            return data || null;
        } catch (error) {
            console.error('Stats error:', error);
            return null;
        }
    }
    
    // Conversation context management methods
    addToConversationHistory(cardId, message, response, conversationId = null) {
        if (!this.conversationHistory.has(cardId)) {
            this.conversationHistory.set(cardId, []);
        }
        
        const history = this.conversationHistory.get(cardId);
        history.push({
            timestamp: new Date().toISOString(),
            message,
            response,
            conversationId
        });
        
        // Also add to main chat history for centralized tracking
        this.mainChatHistory.push({
            timestamp: new Date().toISOString(),
            cardId,
            message,
            response,
            conversationId
        });
        
        // Update current conversation ID if provided
        if (conversationId) {
            this.currentConversationId = conversationId;
        }
    }
    
    getConversationContext(cardId) {
        const history = this.conversationHistory.get(cardId) || [];
        return history.slice(-5); // Return last 5 interactions for context
    }
    
    isFollowUpQuestion(message) {
        // Simple heuristics to detect follow-up questions
        const followUpIndicators = [
            'what about', 'how about', 'can you', 'could you', 'would you',
            'tell me more', 'explain', 'elaborate', 'clarify', 'expand on',
            'what if', 'instead', 'alternative', 'better', 'improve',
            'why', 'how', 'when', 'where', 'which'
        ];
        
        const lowerMessage = message.toLowerCase();
        return followUpIndicators.some(indicator => lowerMessage.includes(indicator));
    }

    
    initializeCard(cardId) {
        this.cardData.set(cardId, {
            uploadedImages: {}, // Object to store images by zone ID
            isProcessing: false
        });
        
        // Add initial state class to the upload card
        const uploadCard = document.getElementById(`card-${cardId}`);
        if (uploadCard) {
            uploadCard.classList.add('initial-state');
        }
    }
    
    createNewCard() {
        this.currentCardId++;
        const cardId = this.currentCardId;
        
        const cardHTML = `
            <div class="upload-card" id="card-${cardId}">
                <div class="card-header">
                    <h2 class="card-title">Rate my designs</h2>
                </div>
                <div class="upload-content-container">
                    <!-- Left Part: Upload and Chat -->
                    <div class="upload-section">
                        <div class="upload-zones">
                            <div class="upload-zone" id="uploadZone-${cardId}-1">
                                <input type="file" id="imageUpload-${cardId}-1" accept="image/*" class="hidden">
                                <div class="upload-content" id="uploadContent-${cardId}-1">
                                    <div class="plus-icon">+</div>
                                </div>
                                <div class="uploaded-image hidden" id="uploadedImage-${cardId}-1"></div>
                                <button class="remove-btn hidden" id="removeBtn-${cardId}-1">×</button>
                            </div>
                            <div class="upload-zone" id="uploadZone-${cardId}-2">
                                <input type="file" id="imageUpload-${cardId}-2" accept="image/*" class="hidden">
                                <div class="upload-content" id="uploadContent-${cardId}-2">
                                    <div class="plus-icon">+</div>
                                </div>
                                <div class="uploaded-image hidden" id="uploadedImage-${cardId}-2"></div>
                                <button class="remove-btn hidden" id="removeBtn-${cardId}-2">×</button>
                            </div>
                            <div class="upload-zone" id="uploadZone-${cardId}-3">
                                <input type="file" id="imageUpload-${cardId}-3" accept="image/*" class="hidden">
                                <div class="upload-content" id="uploadContent-${cardId}-3">
                                    <div class="plus-icon">+</div>
                                </div>
                                <div class="uploaded-image hidden" id="uploadedImage-${cardId}-3"></div>
                                <button class="remove-btn hidden" id="removeBtn-${cardId}-3">×</button>
                            </div>
                        </div>
                        <div class="chat-section">
                            <div class="quick-actions" id="quickActions-${cardId}">
                                <button class="quick-action-btn" data-action="rate this design">Rate this design</button>
                                <button class="quick-action-btn" data-action="quick UI check">Quick UI check</button>
                                <button class="quick-action-btn" data-action="find inspirations for this">Find inspirations</button>
                            </div>
                            <div class="chat-input-container">
                                <div class="chat-tags" id="chatTags-${cardId}"></div>
                                <input type="text" class="chat-input" id="chatInput-${cardId}" placeholder="Ask anything">
                            </div>
                            <button class="send-btn upload-send-btn" id="sendBtn-${cardId}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7l5-5 5 5z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <!-- Right Part: Results -->
                    <div class="results-container hidden" id="resultsContainer-${cardId}">
                        <div class="chat-history-container" id="chatHistory-${cardId}">
                            <div class="chat-history-content" id="chatHistoryContent-${cardId}">
                                <div class="placeholder-text">Coming up with a recommendation</div>
                            </div>
                        </div>
                        <div class="results-content" id="resultsContent-${cardId}">
                            <div class="placeholder-text">Coming up with a recommendation</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const uploadCardsStack = document.getElementById('uploadCardsStack');
        // Append new analysis cards below the first one (keep the first/top card oldest)
        uploadCardsStack.insertAdjacentHTML('beforeend', cardHTML);
        
        this.initializeCard(cardId);
        this.attachCardEventListeners(cardId);
        
        // Start rotating loading messages for new card placeholder
        this.startLoadingMessages(`resultsContent-${cardId}`);
        
        return cardId;
    }
    
    attachCardEventListeners(cardId) {
        // Attach listeners to each of the 3 upload zones
        for (let i = 1; i <= 3; i++) {
            const imageUpload = document.getElementById(`imageUpload-${cardId}-${i}`);
            const uploadZone = document.getElementById(`uploadZone-${cardId}-${i}`);
            const removeBtn = document.getElementById(`removeBtn-${cardId}-${i}`);
            
            imageUpload.addEventListener('change', (e) => this.handleFileUpload(e, cardId, i));
            uploadZone.addEventListener('click', (e) => {
                // Only trigger file input if clicking on the upload content area, not on uploaded images or buttons
                if (e.target.closest('.upload-content') && !e.target.closest('.uploaded-image') && !e.target.closest('.remove-btn') && !e.target.closest('.image-action-btn')) {
                    imageUpload.click();
                }
            });
            uploadZone.addEventListener('dragover', (e) => this.handleDragOver(e));
            uploadZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            uploadZone.addEventListener('drop', (e) => this.handleDrop(e, cardId, i));
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering upload zone click
                this.removeImage(cardId, i);
            });
        }
        
        // Attach chat input listener
        const chatInput = document.getElementById(`chatInput-${cardId}`);
        const sendBtn = document.getElementById(`sendBtn-${cardId}`);
        
        sendBtn.addEventListener('click', () => this.sendMessage(cardId));
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage(cardId);
            }
        });
        
        // Attach quick action button listeners
        const quickActions = document.getElementById(`quickActions-${cardId}`);
        if (quickActions) {
            quickActions.addEventListener('click', (e) => {
                if (e.target.classList.contains('quick-action-btn')) {
                    const action = e.target.getAttribute('data-action');
                    this.handleQuickAction(action, cardId);
                }
            });
        }
    }
    
    setupEventListeners() {
        // Attach listeners to the first card
        this.attachCardEventListeners(1);
        
        // Paste functionality (global)
        document.addEventListener('paste', (e) => this.handlePaste(e));
        
        // Text selection functionality (global)
        this.setupTextSelection();
        
        // Main floating chat functionality
        this.setupMainChat();
        
        // Debug controls functionality
        this.setupDebugControls();

        // Minimize/restore cards
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.card-minimize-btn');
            if (!btn) return;
            const targetId = btn.getAttribute('data-target');
            const el = document.getElementById(targetId);
            if (!el) return;
            el.classList.toggle('minimized');
        });

        // History drawer controls
        const drawer = document.getElementById('historyDrawer');
        const toggleA = document.getElementById('historyDrawerToggle');
        const toggleB = document.getElementById('historyBtn');
        const closeBtn = document.getElementById('historyCloseBtn');
        const newBtn = document.getElementById('historyNewBtn');
        const listEl = document.getElementById('historyDrawerList');
        const openDrawer = () => {
            if (!drawer) return;
            console.debug('[HISTORY] openDrawer');
            drawer.style.transform = 'translateX(0)';
            drawer.setAttribute('aria-hidden', 'false');
            this.renderHistoryDrawer();
        };
        const closeDrawer = () => {
            if (!drawer) return;
            console.debug('[HISTORY] closeDrawer');
            drawer.style.transform = 'translateX(-100%)';
            drawer.setAttribute('aria-hidden', 'true');
            // Move focus away to avoid aria-hidden focus warnings
            try { if (document.activeElement) document.activeElement.blur(); } catch {}
        };
        toggleA && toggleA.addEventListener('click', openDrawer);
        toggleB && toggleB.addEventListener('click', openDrawer);
        closeBtn && closeBtn.addEventListener('click', closeDrawer);
        newBtn && newBtn.addEventListener('click', async () => {
            try {
                const conv = await this.createConversation();
                this.currentConversationId = conv?.id || null;
                await this.renderHistoryDrawer();
            } catch (e) {
                console.warn('createConversation failed', e);
            }
        });
        // Event delegation for conversation click
        if (listEl && !listEl.__histBound) {
            let lastClickAt = 0;
            listEl.addEventListener('click', async (e) => {
                const now = Date.now();
                if (now - lastClickAt < 300) return; // debounce rapid clicks
                lastClickAt = now;
                if (this._loadingConversation) {
                    console.debug('[HISTORY] ignoring click while loading');
                    return;
                }
                const item = e.target.closest('.hist-item');
                if (!item || !listEl.contains(item)) return;
                const id = item.getAttribute('data-conv-id');
                console.debug('[HISTORY] click item', { id, item, hasLoad: typeof this.loadConversation, thisOk: !!this });
                if (!id) return;
                // highlight active
                listEl.querySelectorAll('.hist-item').forEach(n => n.classList.remove('active'));
                item.classList.add('active');
                
                // Pre-open main chat UI so user sees activity and hide left panel
                try { this.setChatState('expanded-state'); this.hideUploadCardAndShowResponse(); } catch {}
                
                // Single-pass load only
                try {
                    const fn = this.loadConversation ? this.loadConversation.bind(this) : null;
                    if (typeof fn !== 'function') {
                        console.error('[HISTORY] loadConversation not callable', { type: typeof this.loadConversation });
                        return;
                    }
                    await fn(id);
                    console.debug('[HISTORY] loadConversation completed');
                } catch (err) {
                    console.error('history click load error', err);
                }
            });
            listEl.__histBound = true;
            console.debug('[HISTORY] delegation bound');
        }

        // Training Data Modal
        this.initTrainingDataModal();
    }
    
    setupDebugControls() {
        const debugSegments = document.querySelectorAll('.debug-segment');
        
        debugSegments.forEach(segment => {
            segment.addEventListener('click', () => {
                // Remove active class from all segments
                debugSegments.forEach(s => s.classList.remove('active'));
                
                // Add active class to clicked segment
                segment.classList.add('active');
                
                // Get the state from data attribute
                const state = segment.getAttribute('data-state');
                
                // Set the chat state
                this.setChatState(state);
                
                // If switching to "initial-state-with-tag", add a sample tag
                if (state === 'initial-state-with-tag') {
                    this.addSampleTag();
                } else {
                    // Clear any existing tags
                    const mainChatTags = document.getElementById('mainChatTags');
                    mainChatTags.innerHTML = '';
                }
            });
        });
    }
    
    addSampleTag() {
        const mainChatTags = document.getElementById('mainChatTags');
        mainChatTags.innerHTML = '';
        
        const tagElement = document.createElement('div');
        tagElement.className = 'chat-tag';
        tagElement.innerHTML = `
            <span class="chat-tag-text">Sample tag for debugging</span>
            <button class="chat-tag-remove" onclick="this.parentElement.remove()">×</button>
        `;
        
        mainChatTags.appendChild(tagElement);
    }
    
    addImageToMainChat(imageUrl, filename) {
        const mainChatTags = document.getElementById('mainChatTags');
        const floatingChat = document.getElementById('floatingChat');
        
        // Create image tag element
        const tagElement = document.createElement('div');
        tagElement.className = 'chat-tag';
        tagElement.innerHTML = `
            <span class="chat-tag-text">📷 ${filename}</span>
            <button class="chat-tag-remove" onclick="this.parentElement.remove(); app.updateChatStateAfterTagChange()">×</button>
        `;
        
        // Store image data in the tag for later use
        tagElement.dataset.imageUrl = imageUrl;
        tagElement.dataset.filename = filename;
        
        mainChatTags.appendChild(tagElement);
        
        // Update chat state to show tags
        this.updateChatStateAfterTagChange();
        
        // Expand main chat if it's collapsed
        if (floatingChat.classList.contains('collapsed-state')) {
            this.setChatState('expanded-state');
        }
    }
    
    setupMainChat() {
        const mainChatInput = document.getElementById('chatInput');
        const mainSendBtn = document.getElementById('sendBtn');
        const historyBtn = document.getElementById('historyBtn');
        const historyDrawerToggle = document.getElementById('historyDrawerToggle');
        const historyCloseBtn = document.getElementById('historyCloseBtn');
        const historyNewBtn = document.getElementById('historyNewBtn');
        const chatToggleBtn = document.getElementById('chatToggleBtn');
        const chatCloseBtn = document.getElementById('chatCloseBtn');
        const chatOpenBtn = document.getElementById('chatOpenBtn');
        const floatingChat = document.getElementById('floatingChat');
        
        // Send message on button click
        mainSendBtn.addEventListener('click', () => {
            this.sendMainChatMessage();
        });
        
        // Show history on button click (new bottom-right button)
        const newHistoryBtn = document.getElementById('historyBtn');
        if (newHistoryBtn) {
            newHistoryBtn.addEventListener('click', () => {
                this.toggleHistoryDrawer(true);
                this.renderHistoryDrawer();
            });
        }
        if (historyDrawerToggle) {
            historyDrawerToggle.addEventListener('click', () => {
                this.toggleHistoryDrawer(true);
                this.renderHistoryDrawer();
            });
        }
        if (historyCloseBtn) {
            historyCloseBtn.addEventListener('click', () => this.toggleHistoryDrawer(false));
        }
        if (historyNewBtn) {
            historyNewBtn.addEventListener('click', async () => {
                await this.createConversation();
                await this.refreshConversationsIntoDrawer();
            });
        }
        
        // Send message on Enter key
        mainChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMainChatMessage();
            }
        });

        // Provider selection removed - now loaded from app_settings
        
        // Toggle chat collapse/expand
        chatToggleBtn.addEventListener('click', () => {
            this.toggleMainChat();
        });

        // Close chat (does not clear history)
        chatCloseBtn.addEventListener('click', () => {
            floatingChat.style.display = 'none';
            chatOpenBtn.style.display = 'flex';
            // Hide quick action buttons when main chat is closed
            this.hideQuickActionButtons();
        });

        // Reopen chat
        chatOpenBtn.addEventListener('click', () => {
            floatingChat.style.display = 'flex';
            chatOpenBtn.style.display = 'none';
            // Show quick action buttons when main chat is reopened (if not already hidden)
            this.showQuickActionButtons();
        });
        
        // Initialize chat in initial state
        this.setChatState('initial-state');
        
        // Show message history by default if there are any messages
        if (this.mainChatHistory.length > 0) {
            this.showMainChatHistory();
        } else {
            // Start rotating loading messages for main chat placeholder
            this.startLoadingMessages('chatResultsContent');
        }
        
        // Start rotating loading messages for container chat placeholder
        this.startLoadingMessages('resultsContent-1');
        
        // Attach main chat quick action listeners
        const mainQuickActions = document.getElementById('mainQuickActions');
        if (mainQuickActions) {
            mainQuickActions.addEventListener('click', (e) => {
                if (e.target.classList.contains('quick-action-btn')) {
                    const action = e.target.getAttribute('data-action');
                    this.handleMainQuickAction(action);
                }
            });
        }
    }
    
    setChatState(state) {
        const floatingChat = document.getElementById('floatingChat');
        
        // Remove all state classes
        floatingChat.classList.remove('initial-state', 'initial-state-with-tag', 'expanded-state', 'collapsed-state');
        
        // Add the new state class
        floatingChat.classList.add(state);
    }
    
    toggleMainChat() {
        const floatingChat = document.getElementById('floatingChat');
        
        if (floatingChat.classList.contains('collapsed-state')) {
            this.setChatState('expanded-state');
        } else {
            this.setChatState('collapsed-state');
        }
    }
    
    async showConversationHistory() {
        if (!this.accessToken) {
            alert('Please sign in to view conversation history');
            return;
        }
        
        try {
            const conversations = await this.loadConversations();
            const historyContainer = document.getElementById('chatResultsContent');
            
            if (conversations.length === 0) {
                historyContainer.innerHTML = '<div class="placeholder-text">No conversations yet</div>';
                return;
            }
            
            const historyHTML = conversations.map(conv => `
                <div class="conversation-item" style="padding: 8px; border: 1px solid #ddd; margin: 4px 0; border-radius: 4px; cursor: pointer;" onclick="app.loadConversation('${conv.id}')">
                    <div style="font-weight: bold;">${conv.title || 'Untitled'}</div>
                    <div style="font-size: 12px; color: #666;">${new Date(conv.updated_at).toLocaleString()}</div>
                </div>
            `).join('');
            
            historyContainer.innerHTML = `
                <div style="padding: 16px;">
                    <h3>Conversation History</h3>
                    <div>${historyHTML}</div>
                </div>
            `;
        } catch (error) {
            console.error('Failed to load conversations:', error);
            alert('Failed to load conversation history');
        }
    }

    toggleHistoryDrawer(open) {
        const drawer = document.getElementById('historyDrawer');
        if (!drawer) return;
        if (typeof open === 'boolean') {
            drawer.style.transform = open ? 'translateX(0)' : 'translateX(-100%)';
        } else {
            const isOpen = drawer.style.transform === 'translateX(0)';
            drawer.style.transform = isOpen ? 'translateX(-100%)' : 'translateX(0)';
        }
    }

    async refreshConversationsIntoDrawer() {
        try {
            const list = document.getElementById('historyDrawerList');
            if (!list) return;
            const conversations = await this.loadConversations();
            if (!conversations || conversations.length === 0) {
                list.innerHTML = '<div style="padding:16px;color:#94a3b8;">No conversations yet</div>';
                return;
            }
            list.innerHTML = conversations.map(conv => `
                <div class="history-conv-item" data-id="${conv.id}" style="padding:12px 14px;border-bottom:1px solid #111827;cursor:pointer;${conv.id===this.currentConversationId?'background:#1f2937;border-left:3px solid #60a5fa;':''}">
                    <div style="font-size:14px;color:#e5e7eb;">${this.escapeHtml(conv.title || this.generateTitleFromMessage('') || 'Untitled conversation')}</div>
                    <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${new Date(conv.updated_at||conv.created_at).toLocaleString()}</div>
                </div>
            `).join('');
            list.querySelectorAll('.history-conv-item').forEach(el => {
                el.addEventListener('click', async () => {
                    const id = el.getAttribute('data-id');
                    await this.loadConversation(id);
                    this.currentConversationId = id;
                    await this.refreshConversationsIntoDrawer();
                    this.toggleHistoryDrawer(false);
                });
            });
        } catch (e) {
            console.error('Failed to load conversations into drawer', e);
        }
    }

    async renderHistoryDrawer() {
        const listEl = document.getElementById('historyDrawerList');
        if (!listEl) return;
        console.debug('[HISTORY] render start');
        listEl.innerHTML = '<div style="padding:12px;color:#94a3b8;">Loading…</div>';
        try {
            const conversations = await this.loadConversations();
            console.debug('[HISTORY] conversations', { count: conversations?.length });
            if (!Array.isArray(conversations) || conversations.length === 0) {
                listEl.innerHTML = '<div style="padding:12px;color:#94a3b8;">No conversations yet</div>';
                return;
            }
            const currentId = this.currentConversationId;
            const html = conversations.map(c => {
                const title = (c.title && String(c.title).trim()) || '(no title yet)';
                const active = currentId && c.id === currentId;
                return `
                    <div data-conv-id="${c.id}" class="hist-item${active ? ' active' : ''}" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid #1f2937;${active ? 'background:#111827;' : ''}">
                        <div style=\"font-size:14px;color:#e5e7eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;\">${this.escapeHtml(title)}</div>
                        ${c.page_name ? `<div style=\"font-size:12px;color:#9ca3af;\">${this.escapeHtml(c.page_name)}</div>` : ''}
                    </div>`;
            }).join('');
            listEl.innerHTML = html;
            console.debug('[HISTORY] render done');
        } catch (e) {
            console.error('[HISTORY] render failed', e);
            listEl.innerHTML = `<div style=\"padding:12px;color:#ef4444;\">Failed to load history</div>`;
        }
    }

    async loadConversation(conversationId) {
        try {
            if (this._loadingConversation) {
                console.debug('[CONV] already loading, ignoring click');
                return;
            }
            this._loadingConversation = true;
            this._historyView = true;
            console.log('[CONV] load start', { conversationId });
            this.currentConversationId = conversationId;

            // Prepare UI
            this.resetMainChatUI();

            // Load messages
            const messages = await this.loadMessages(conversationId);
            console.log('[CONV] messages fetched', { count: messages?.length });
            try {
                const diag = (messages || []).slice(0, 6).map(m => ({
                    role: m.role,
                    hasContent: m.content != null,
                    contentType: typeof m.content,
                    hasValue: m?.content?.value !== undefined,
                    valueType: typeof (m?.content?.value),
                    isArray: Array.isArray(m?.content?.value),
                    arrayLen: Array.isArray(m?.content?.value) ? m.content.value.length : undefined,
                }));
                console.log('[CONV] diag sample', diag);
                const firstUser = (messages || []).find(x => (x.role||'').toLowerCase()==='user');
                if (firstUser) {
                    const raw = firstUser.content !== undefined ? firstUser.content : firstUser.message;
                    console.log('[CONV] firstUser raw', raw);
                }
            } catch {}

            // Clear main chat history
            this.mainChatHistory = [];
            this.chatMemory = [];

            // Filter out non-final assistant chunks
            const cleaned = Array.isArray(messages) ? messages.filter(m => {
                const role = (m.role || '').toLowerCase();
                if (role !== 'assistant') return true;
                return m.is_final === true || m.chunk_index == null;
            }) : [];
            console.log('[CONV] cleaned count', { count: cleaned.length });

            // Normalize and push
            cleaned.forEach(msg => {
                const role = (msg.role || '').toLowerCase();
                const raw = (msg.content !== undefined ? msg.content : msg.message);
                const value = (raw && typeof raw === 'object' && raw.value !== undefined) ? raw.value : raw;
                if (Array.isArray(value)) {
                    const parts = [];
                    for (const p of value) {
                        if (p?.type === 'text' && typeof p.text === 'string') {
                            parts.push({ kind: 'text', text: p.text });
                        } else if (p?.type === 'image_url' && p.image_url?.url) {
                            console.log('[CONV] Processing image_url:', p.image_url.url.substring(0, 100) + '...');
                            parts.push({ kind: 'image', src: p.image_url.url });
                        } else if (typeof p === 'string') {
                            parts.push({ kind: 'text', text: p });
                        }
                    }
                    this.chatMemory.push({ role, contentParts: parts });
                } else {
                    const normalized = this.normalizeContentAsText(value);
                    this.chatMemory.push({ role, content: normalized });
                }
            });

            // Also populate mainChatHistory for compatibility
            this.mainChatHistory = [];
            cleaned.forEach(msg => {
                const role = (msg.role || '').toLowerCase();
                const raw = (msg.content !== undefined ? msg.content : msg.message);
                const value = (raw && typeof raw === 'object' && raw.value !== undefined) ? raw.value : raw;
                
                if (role === 'user') {
                    this.mainChatHistory.push({
                        timestamp: msg.created_at || new Date().toISOString(),
                        message: Array.isArray(value) ? value.map(p => p.text || p).join(' ') : value,
                        response: ''
                    });
                } else if (role === 'assistant') {
                    if (this.mainChatHistory.length > 0) {
                        this.mainChatHistory[this.mainChatHistory.length - 1].response = Array.isArray(value) ? value.map(p => p.text || p).join(' ') : value;
                    }
                }
            });

            // Inject preview synthetic user image message at the top if not already present
            try {
                if (this._previewFirstUserMsg) {
                    const exists = this.chatMemory.some(m => m.role === 'user' && typeof m.content === 'string' && m.content.includes(this._previewImageSrc || ''));
                    if (!exists) {
                        // If there is already a first user message, prefix the image marker to it
                        const firstUserIndex = this.chatMemory.findIndex(m => m.role === 'user');
                        if (firstUserIndex !== -1) {
                            const firstUser = this.chatMemory[firstUserIndex];
                            if (typeof firstUser.content === 'string') {
                                firstUser.content = `[image: ${this._previewImageSrc}]\n` + firstUser.content;
                            }
                        } else {
                            this.chatMemory.unshift(this._previewFirstUserMsg);
                        }
                    }
                }
            } catch {}

            // We render directly inside the conversation (right panel); left panel stays hidden
            console.log('[CONV] About to call showMainChatHistory');
            console.log('[CONV] chatMemory before showMainChatHistory:', this.chatMemory);
            this.showMainChatHistory();
            console.log('[CONV] rendered main chat');
            
            // Force show the main chat area
            const floatingChat = document.getElementById('floatingChat');
            if (floatingChat) {
                floatingChat.style.display = 'flex';
                floatingChat.classList.remove('collapsed-state');
                floatingChat.classList.add('expanded-state');
            }

            // Force-inject preview image if not present in DOM after render
            try {
                if (this._previewImageSrc) {
                    const chatResultsContent = document.getElementById('chatResultsContent');
                    if (chatResultsContent) {
                        const existsImg = chatResultsContent.querySelector(`img[src="${this._previewImageSrc}"]`);
                        if (!existsImg) {
                            const wrapper = document.createElement('div');
                            wrapper.className = 'chat-message user-message';
                            wrapper.innerHTML = `
                                <div class="message-header"><span class="message-sender">You</span><span class="message-time"></span></div>
                                <div class="message-content"><img src="${this._previewImageSrc}" alt="image" style="max-width: 260px; border-radius: 10px; display:block;"></div>
                            `;
                            const historyContainer = chatResultsContent.querySelector('.chat-history-content');
                            if (historyContainer) historyContainer.insertAdjacentElement('afterbegin', wrapper);
                        }
                    }
                }
            } catch {}

            await this.renderHistoryDrawer();

            // Close drawer & blur
            const drawer = document.getElementById('historyDrawer');
            if (drawer) {
                drawer.style.transform = 'translateX(-100%)';
                drawer.setAttribute('aria-hidden', 'true');
                try { if (document.activeElement) document.activeElement.blur(); } catch {}
            }

            // Re-trigger inspirations off the last command-like message
            try {
                const lastAssistant = [...this.chatMemory].reverse().find(m => m.role === 'assistant');
                const lastUser = [...this.chatMemory].reverse().find(m => m.role === 'user');
                const lastCmdMsg = [...this.chatMemory].reverse().find(m => typeof m.content === 'string' && /command\s*:?.*send\s+[a-z0-9]+/i.test(m.content));
                if (lastCmdMsg && typeof lastCmdMsg.content === 'string') await this.handleCommand(lastCmdMsg.content);
                // Also attempt on last assistant and user texts (no-op if not a command)
                if (lastAssistant && typeof lastAssistant.content === 'string') {
                    try { await this.handleCommand(lastAssistant.content); } catch {}
                }
                if (lastUser && typeof lastUser.content === 'string') {
                    try { await this.handleCommand(lastUser.content); } catch {}
                }
            } catch {}

        } catch (error) {
            console.error('[CONV] Failed to load conversation:', error);
            console.error('[CONV] Error stack:', error.stack);
            const chatResultsContent = document.getElementById('chatResultsContent');
            if (chatResultsContent) chatResultsContent.innerHTML = '<div class="placeholder-text">Failed to load conversation</div>';
        } finally {
            this._loadingConversation = false;
        }
    }

    // Reset main chat UI for loading a conversation
    resetMainChatUI() {
        console.log('[CONV] Resetting main chat UI');
        
        // Clear any existing chat content
        const chatResultsContent = document.getElementById('chatResultsContent');
        if (chatResultsContent) {
            chatResultsContent.innerHTML = '<div class="placeholder-text">Loading conversation...</div>';
        }
        
        // Clear input
        const mainChatInput = document.getElementById('chatInput');
        if (mainChatInput) {
            mainChatInput.value = '';
        }
        
        // Clear tags
        const mainChatTags = document.getElementById('mainChatTags');
        if (mainChatTags) {
            mainChatTags.innerHTML = '';
        }
        
        // Show the main chat
        const floatingChat = document.getElementById('floatingChat');
        if (floatingChat) {
            floatingChat.style.display = 'flex';
        }
        
        // Hide the chat open button
        const chatOpenBtn = document.getElementById('chatOpenBtn');
        if (chatOpenBtn) {
            chatOpenBtn.style.display = 'none';
        }
    }

    showConversationMessages(messages) {
        // This method is now deprecated - use loadConversation instead
        console.warn('showConversationMessages is deprecated, use loadConversation instead');
    }

    generateTitleFromMessage(message) {
        try {
            let text = typeof message === 'string' ? message : '';
            text = text.trim();
            if (!text) return '';
            text = text.replace(/^please\s+/i, '')
                       .replace(/^can you\s+/i, '')
                       .replace(/^could you\s+/i, '');
            const words = text.split(/\s+/).slice(0, 8).join(' ');
            const titled = words.charAt(0).toUpperCase() + words.slice(1);
            return titled;
        } catch(_) { return ''; }
    }

    escapeHtml(str) {
        return String(str||'').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
    }
    
    async loadConversation(conversationId) {
        try {
            const messages = await this.loadMessages(conversationId);
            console.debug('[CONV] diag sample messages', messages.slice(0, 2));
            const firstUserMessage = messages.find(m => m.role === 'user');
            if (firstUserMessage) {
                console.debug('[CONV] firstUser raw content', firstUserMessage.content);
            }
            this.currentConversationId = conversationId;
            
            // Populate chatMemory and mainChatHistory for rendering
            this.chatMemory = [];
            this.mainChatHistory = [];
            
            messages.forEach((msg, index) => {
                console.log(`[CONV] Processing message ${index}:`, {
                    role: msg.role,
                    content: msg.content,
                    message: msg.message,
                    id: msg.id,
                    is_final: msg.is_final
                });
                
                const role = (msg.role || '').toLowerCase();
                const raw = (msg.content !== undefined ? msg.content : msg.message);
                const value = (raw && typeof raw === 'object' && raw.value !== undefined) ? raw.value : raw;
                
                console.log(`[CONV] Processed message ${index}:`, {
                    role,
                    raw,
                    value,
                    isArray: Array.isArray(value),
                    type: typeof value
                });
                
                if (Array.isArray(value)) {
                    const parts = [];
                    for (const p of value) {
                        if (p?.type === 'text' && typeof p.text === 'string') {
                            parts.push({ kind: 'text', text: p.text });
                        } else if (p?.type === 'image_url' && p.image_url?.url) {
                            console.log('[CONV] Processing image_url:', p.image_url.url.substring(0, 100) + '...');
                            parts.push({ kind: 'image', src: p.image_url.url });
                        } else if (typeof p === 'string') {
                            parts.push({ kind: 'text', text: p });
                        }
                    }
                    this.chatMemory.push({ role, contentParts: parts });
                } else {
                    const normalized = this.normalizeContentAsText(value);
                    this.chatMemory.push({ role, content: normalized });
                }
            });
            
            // Also populate mainChatHistory for compatibility
            messages.forEach(msg => {
                const role = (msg.role || '').toLowerCase();
                const raw = (msg.content !== undefined ? msg.content : msg.message);
                const value = (raw && typeof raw === 'object' && raw.value !== undefined) ? raw.value : raw;
                
                if (role === 'user') {
                    this.mainChatHistory.push({
                        timestamp: msg.created_at || new Date().toISOString(),
                        message: Array.isArray(value) ? value.map(p => p.text || p).join(' ') : value,
                        response: ''
                    });
                } else if (role === 'assistant') {
                    if (this.mainChatHistory.length > 0) {
                        this.mainChatHistory[this.mainChatHistory.length - 1].response = Array.isArray(value) ? value.map(p => p.text || p).join(' ') : value;
                    }
                }
            });
            
            // RENDER THE CONVERSATION
            console.log('[CONV] About to call showMainChatHistory');
            console.log('[CONV] chatMemory before showMainChatHistory:', this.chatMemory);
            this.showMainChatHistory();
            console.log('[CONV] showMainChatHistory completed');
            
            const historyContainer = document.getElementById('chatResultsContent');
	            const historyHTML = messages.map(msg => {
	                let contentHtml = '';
	                const c = msg && msg.content ? msg.content : null;
	                if (c && c.type === 'multimodal' && Array.isArray(c.value)) {
	                    for (const part of c.value) {
	                        const partType = part && (part.type || part.kind);
	                        if (partType === 'text') {
	                            const textVal = typeof part.text === 'string' ? part.text : (typeof part.value === 'string' ? part.value : '');
	                            contentHtml += `<div>${this.formatContent(textVal)}</div>`;
	                        } else if (partType === 'image_url' || partType === 'image') {
	                            const src = (part.image_url && (part.image_url.url || part.image_url)) || part.src || '';
	                            if (src) {
	                                contentHtml += `<img src="${src}" alt="image" style="max-width: 260px; border-radius: 10px; margin-top: 8px; display:block;">`;
	                            }
	                        }
	                    }
	                    if (!contentHtml) contentHtml = '<div></div>';
	                } else if (c && typeof c.value === 'string') {
	                    contentHtml = this.formatContent(c.value);
	                } else if (typeof c === 'string') {
	                    contentHtml = this.formatContent(c);
	                } else {
	                    // Fallback: try to stringify
	                    try {
	                        contentHtml = this.formatContent(JSON.stringify(c));
	                    } catch(_) {
	                        contentHtml = '<div></div>';
	                    }
	                }
	                return `
	                <div class="chat-message ${msg.role}-message" style="margin: 8px 0; padding: 8px; border-radius: 4px; background: ${msg.role === 'user' ? '#f0f0f0' : '#e3f2fd'};">
	                    <div style="font-weight: bold; margin-bottom: 4px;">${msg.role === 'user' ? 'You' : 'AI'}</div>
	                    <div>${contentHtml}</div>
	                </div>`;
	            }).join('');
            
            historyContainer.innerHTML = `
                <div style="padding: 16px;">
                    <h3>Conversation</h3>
                    <div>${historyHTML}</div>
                </div>
            `;
        } catch (error) {
            console.error('Failed to load conversation:', error);
            alert('Failed to load conversation');
        }
    }

    async sendMainChatMessage() {
        if (!this.accessToken) {
            alert('Please sign in to send messages');
            return;
        }
        
        const mainChatInput = document.getElementById('chatInput');
        const mainChatTags = document.getElementById('mainChatTags');
        const chatResultsContent = document.getElementById('chatResultsContent');
        const floatingChat = document.getElementById('floatingChat');
        const message = mainChatInput.value.trim();
        
        // Get tags text and card content
        const tagElements = Array.from(mainChatTags.querySelectorAll('.chat-tag'));
        let tagsText = '';
        let hasCardTags = false;
        
        for (const tagElement of tagElements) {
            const tagText = tagElement.querySelector('.chat-tag-text').textContent;
            const cardContent = tagElement.cardContent || tagElement.dataset.cardContent;
            const argumentContent = tagElement.dataset.argumentContent;
            const parentCard = tagElement.dataset.parentCard;
            const fullContext = tagElement.dataset.fullContext;
            const isAnswerSelection = tagElement.dataset.isAnswerSelection === 'true';
            
            
            if (argumentContent) {
                // Include the full argument content for argument tags
                tagsText += `[${tagText} from ${parentCard}]\n${argumentContent}\n\n`;
            } else if (cardContent) {
                // Include the full card content for card tags
                tagsText += `[${tagText}]\n${cardContent}\n\n`;
                hasCardTags = true;
            } else if (isAnswerSelection && fullContext) {
                // Include the full context for answer selections
                tagsText += `[${tagText}]\n${fullContext}\n\n`;
            } else {
                // Regular tag text for other tags
                tagsText += tagText + ' ';
            }
        }
        
        // Handle the two scenarios for card tags
        let fullMessage;
        if (hasCardTags && message.trim()) {
            // Scenario 1: User sends additional message and tags a card
            // Pass on "message" + "text from the tagged card"
            fullMessage = message + '\n\n' + tagsText;
        } else if (hasCardTags && !message.trim()) {
            // Scenario 2: User just tags the card and sends
            // Pass on "can you go deeper into" + "text from the tagged card"
            fullMessage = 'can you go deeper into ' + tagsText;
        } else {
            // No card tags, use original behavior
            fullMessage = tagsText + message;
        }
        
        
        if (!fullMessage.trim()) {
            return;
        }
        
        // If the user directly pasted a COMMAND, handle immediately (no agent roundtrip)
        const directCmd = String(fullMessage).match(COMMAND_RE);
        if (directCmd) {
            this.setChatState('expanded-state');
            this.showMainChatResults('Loading inspirations…');
            await this.handleCommand(fullMessage);
            return;
        }
        
        // Collect all images from tagged cards
        const taggedImages = [];
        for (const tagElement of tagElements) {
            const parentCard = tagElement.dataset.parentCard;
            if (parentCard) {
                const cardId = parseInt(parentCard);
                const cardData = this.cardData.get(cardId);
                if (cardData && cardData.uploadedImages) {
                    Object.values(cardData.uploadedImages).forEach(img => {
                        taggedImages.push({
                            type: 'image_url',
                            image_url: { url: img.url, detail: 'auto' }
                        });
                    });
                }
            }
        }
        
        // Find the most recent card with images (fallback)
        const mostRecentCardId = this.findMostRecentCardWithImages();
        
        // Clear input and tags
        mainChatInput.value = '';
        mainChatTags.innerHTML = '';
        
        // Reset placeholder to initial state
        mainChatInput.placeholder = 'Ask something...';
        
        // Transition to expanded state and show processing state
        this.setChatState('expanded-state');
        this.showMainChatResults('AI is analyzing your design...');
        
        // Start rotating loading messages
        this.startLoadingMessages('chatResultsContent');
        
        // Hide upload card and show response card when using main chat
        this.hideUploadCardAndShowResponse();
        
        try {
            // Create multimodal message with all images (original format that worked)
            let msgPayload = fullMessage;
            if (taggedImages.length > 0) {
                msgPayload = [
                    { type: 'text', text: fullMessage },
                    ...taggedImages
                ];
            } else if (mostRecentCardId) {
                // Fallback to most recent card if no tagged images
                const cardData = this.cardData.get(mostRecentCardId);
                const firstKey = cardData ? Object.keys(cardData.uploadedImages)[0] : null;
                if (firstKey) {
                    msgPayload = [
                        { type: 'text', text: fullMessage },
                        { type: 'image_url', image_url: { url: cardData.uploadedImages[firstKey].url, detail: 'auto' } }
                    ];
                }
            }

            let streamedText = '';
            await this.sendChat({
                provider: this.currentProvider,
                model: this.currentModel,
                systemPrompt: this.currentSystemPrompt,
                message: msgPayload,
                history: this.getLastHistory(20),
                onDelta: (delta, full) => {
                    streamedText = full;
                    this.showResponseInCard(full);
                },
                onDone: async (finalText) => {
                    this.mainChatHistory.push({
                        timestamp: new Date().toISOString(),
                        cardId: mostRecentCardId || 'main-chat',
                        message: fullMessage,
                        response: finalText || 'Done',
                        conversationId: this.currentConversationId
                    });
                    this.appendHistory(fullMessage, finalText || '');
                    this.stopLoadingMessages();
                    this.showMainChatHistory();
                    this.hideQuickActionButtons();
                    // Refresh history drawer to show new conversation
                    this.renderHistoryDrawer();
                    this.handleCommand(finalText || '');
                    this.handleCommand(fullMessage);
                    // Set summarized title immediately after first user message
                    try {
                        const title = this.generateTitleFromMessage(fullMessage) || 'New conversation';
                        if (title && this.currentConversationId) {
                            await fetch(`${this.backendUrl}/conversations/${this.currentConversationId}`, {
                                method: 'PUT',
                                headers: this.getAuthHeaders(),
                                body: JSON.stringify({ title })
                            });
                            this.renderHistoryDrawer();
                        }
                    } catch (_) {}
                }
            });
        } catch (error) {
            console.error('Error:', error);
            this.showMainChatResults('Sorry, I encountered an error. Please try again.');
        }
    }
    
    
    showMainChatResults(text) {
        const chatResultsContent = document.getElementById('chatResultsContent');
        
        // Try to parse and format the text into different card types
        const parsedContent = this.parseDustOutput(text);
        
        if (parsedContent.cards && parsedContent.cards.length > 0) {
            // Render structured cards
            chatResultsContent.innerHTML = this.renderStructuredCards(parsedContent.cards);
        } else {
            // Fallback to plain text display
            chatResultsContent.textContent = text;
        }
    }
    
    showMainChatError(message) {
        const chatResultsContent = document.getElementById('chatResultsContent');
        chatResultsContent.textContent = `Error: ${message}`;
        this.setChatState('expanded-state');
    }
    
    // Display centralized conversation summary in main chat
    showMainChatHistory() {
        const chatResultsContent = document.getElementById('chatResultsContent');
        if (!chatResultsContent) {
            console.log('[CHAT] No chatResultsContent element found');
            return;
        }
        
        console.log('[CHAT] showMainChatHistory called');
        console.log('[CHAT] chatMemory length:', this.chatMemory?.length);
        console.log('[CHAT] mainChatHistory length:', this.mainChatHistory?.length);
        
        // Show chat memory if available (loaded conversation)
        if (this.chatMemory && this.chatMemory.length > 0) {
            console.log('[CHAT] Rendering from chatMemory');
            console.log('[CHAT] chatMemory data:', this.chatMemory);
                const renderItem = (msg) => {
                    const role = msg.role || '';
                    const isUser = role === 'user';
                    let contentHtml = '';
                    if (Array.isArray(msg.contentParts)) {
                        console.log('[CHAT] Processing contentParts:', msg.contentParts.length, 'parts');
                        for (const part of msg.contentParts) {
                            console.log('[CHAT] Part:', part.kind, part.src ? part.src.substring(0, 100) + '...' : part.text?.substring(0, 100) + '...');
                            if (part.kind === 'text') {
                                contentHtml += `<div>${this.formatContent(part.text)}</div>`;
                            } else if (part.kind === 'image') {
                                console.log('[CHAT] Rendering image from contentParts:', part.src.substring(0, 100) + '...');
                                console.log('[CHAT] Full image src length:', part.src.length);
                                // Test with a simple image first
                                contentHtml += `<div style="background: red; color: white; padding: 10px; margin: 10px 0;">TEST IMAGE SHOULD BE HERE</div>`;
                                contentHtml += `<img src="${part.src}" alt="image" style="max-width: 260px; border-radius: 10px; margin-top: 8px; display:block; border: 2px solid red;">`;
                            }
                        }
                        if (!contentHtml) contentHtml = '<div></div>';
                    } else {
                        console.log('[CHAT] Processing non-array content:', typeof msg.content, msg.content ? msg.content.substring(0, 100) + '...' : 'null');
                        const { imgSrc, strippedText } = this.extractImageFromContent(msg.content || '');
                        if (imgSrc) {
                            console.log('[CHAT] Rendering image from extractImageFromContent:', imgSrc.substring(0, 100) + '...');
                            console.log('[CHAT] Full image src length:', imgSrc.length);
                            // Test with a simple image first
                            const safeText = this.escapeHtml(strippedText);
                            contentHtml = `${safeText ? `<div>${safeText}</div>` : ''}<div style="background: red; color: white; padding: 10px; margin: 10px 0;">TEST IMAGE SHOULD BE HERE</div><img src="${imgSrc}" alt="image" style="max-width: 260px; border-radius: 10px; margin-top: 8px; display:block; border: 2px solid red;">`;
                        } else {
                            console.log('[CHAT] No image found, using formatContent');
                            contentHtml = this.formatContent(msg.content || '');
                        }
                    }
                const sender = isUser ? 'You' : 'AI';
                const messageClass = isUser ? 'user-message' : 'agent-message';
                return `
                    <div class="chat-message ${messageClass}">
                        <div class="message-header">
                            <span class="message-sender">${sender}</span>
                            <span class="message-time"></span>
                        </div>
                        <div class="message-content">${contentHtml}</div>
                    </div>
                `;
            };

            const historyHTML = this.chatMemory.map(renderItem).join('');
            console.log('[CHAT] Generated historyHTML:', historyHTML);
            console.log('[CHAT] historyHTML length:', historyHTML.length);
            
            chatResultsContent.innerHTML = `
                <div class="chat-history-container">
                    <div class="chat-history-content">
                        ${historyHTML}
                    </div>
                </div>
            `;
            
            // Force visibility
            chatResultsContent.style.display = 'block';
            chatResultsContent.style.visibility = 'visible';
            chatResultsContent.style.height = 'auto';
            chatResultsContent.style.overflow = 'visible';
            console.log('[CHAT] Set innerHTML, chatResultsContent now has:', chatResultsContent.innerHTML.length, 'characters');
            console.log('[CHAT] chatResultsContent display:', chatResultsContent.style.display);
            console.log('[CHAT] chatResultsContent visibility:', chatResultsContent.style.visibility);
            console.log('[CHAT] chatResultsContent height:', chatResultsContent.offsetHeight);
            console.log('[CHAT] chatResultsContent width:', chatResultsContent.offsetWidth);
            console.log('[CHAT] chatResultsContent parent:', chatResultsContent.parentElement);
            
            // FORCE SHOW THE CHAT UI
            const floatingChat = document.getElementById('floatingChat');
            if (floatingChat) {
                floatingChat.style.display = 'flex';
                floatingChat.classList.remove('collapsed-state');
                floatingChat.classList.add('expanded-state');
                console.log('[CHAT] Forced floatingChat to show');
            }
            
            // HIDE THE HISTORY DRAWER
            const historyDrawer = document.getElementById('historyDrawer');
            if (historyDrawer) {
                historyDrawer.style.display = 'none';
                console.log('[CHAT] Hid history drawer');
            }
            return;
        }
        
        // Fallback to mainChatHistory if no chatMemory
        if (this.mainChatHistory.length === 0) {
            chatResultsContent.innerHTML = '<div class="placeholder-text">No conversation yet</div>';
            return;
        }
        
        const historyHTML = this.mainChatHistory.map(entry => `
            <div class="chat-message user-message">
                <div class="message-header">
                    <span class="message-sender">You</span>
                    <span class="message-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="message-content">${this.formatContent(entry.message)}</div>
            </div>
            <div class="chat-message agent-message">
                <div class="message-header">
                    <span class="message-sender">AI</span>
                    <span class="message-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="message-content">${this.formatContent(entry.response)}</div>
            </div>
        `).join('');
        
        chatResultsContent.innerHTML = `
            <div class="chat-history-container">
                <h3>Conversation History</h3>
                <div class="chat-history-content">
                    ${historyHTML}
                </div>
            </div>
        `;
    }
    
    findMostRecentCardWithImages() {
        // Find the card with the highest ID that has images
        let mostRecentCardId = null;
        let highestId = 0;
        
        for (const [cardId, cardData] of this.cardData.entries()) {
            const hasImages = Object.keys(cardData.uploadedImages).length > 0;
            if (hasImages && parseInt(cardId) > highestId) {
                highestId = parseInt(cardId);
                mostRecentCardId = cardId;
            }
        }
        
        return mostRecentCardId;
    }
    
    setupTextSelection() {
        const floatingBtn = document.getElementById('selectionFloatingBtn');
        let currentSelection = '';
        let currentCardId = null;
        
        // Handle text selection
        document.addEventListener('mouseup', (e) => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            
            if (selectedText && selectedText.length > 0) {
                // Check if selection is within a results container (upload cards) or main chat results
                const resultsContainer = e.target.closest('.results-content');
                const chatResultsContainer = e.target.closest('.chat-results-content');
                
                if (resultsContainer) {
                    const cardId = resultsContainer.id.match(/resultsContent-(\d+)/)?.[1];
                    if (cardId) {
                        currentSelection = selectedText;
                        currentCardId = cardId;
                        this.showFloatingButton(e, floatingBtn);
                    }
                } else if (chatResultsContainer) {
                    // Selection is in main chat results
                    currentSelection = selectedText;
                    currentCardId = 'main-chat';
                    this.showFloatingButton(e, floatingBtn);
                } else {
                    this.hideFloatingButton(floatingBtn);
                }
            } else {
                this.hideFloatingButton(floatingBtn);
            }
        });
        
        // Handle floating button click
        floatingBtn.addEventListener('click', () => {
            if (currentSelection && currentCardId) {
                if (currentCardId === 'main') {
                    // Add to main chat tags
                    this.addTagToMainChat(currentSelection);
                } else {
                    // Add to container chat tags
                    this.addTagToChat(currentCardId, currentSelection);
                }
                this.hideFloatingButton(floatingBtn);
                // Clear selection
                window.getSelection().removeAllRanges();
            }
        });
        
        // Hide button when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.results-content') && 
                !e.target.closest('.chat-results-content') && 
                !e.target.closest('.selection-floating-btn')) {
                this.hideFloatingButton(floatingBtn);
            }
        });
    }
    
    showFloatingButton(e, floatingBtn) {
        const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
        floatingBtn.style.display = 'block';
        floatingBtn.style.left = `${rect.left + rect.width / 2 - 40}px`;
        floatingBtn.style.top = `${rect.top - 40}px`;
    }
    
    hideFloatingButton(floatingBtn) {
        floatingBtn.style.display = 'none';
    }
    
    addTagToChat(cardId, text) {
        const chatTags = document.getElementById(`chatTags-${cardId}`);
        if (!chatTags) return;

        // Get the full context where the text was selected from
        const fullContext = this.getFullContextFromSelection(text);
        
        const tagElement = document.createElement('div');
        tagElement.className = 'chat-tag';
        tagElement.innerHTML = `
            <span class="chat-tag-text">${this.escapeHtml(text)}</span>
            <button class="chat-tag-remove" title="Remove">×</button>
        `;

        // Store the full context for later use
        if (fullContext) {
            tagElement.dataset.fullContext = fullContext;
            tagElement.dataset.isAnswerSelection = 'true';
        }

        tagElement.querySelector('.chat-tag-remove').addEventListener('click', () => {
            tagElement.remove();
        });

        chatTags.appendChild(tagElement);
    }
    
    addTagToMainChat(text) {
        const mainChatTags = document.getElementById('mainChatTags');
        if (!mainChatTags) return;

        // Get the full context where the text was selected from
        const fullContext = this.getFullContextFromSelection(text);
        
        const tagElement = document.createElement('div');
        tagElement.className = 'chat-tag';
        tagElement.innerHTML = `
            <span class="chat-tag-text">${this.escapeHtml(text)}</span>
            <button class="chat-tag-remove" title="Remove">×</button>
        `;

        // Store the full context for later use
        if (fullContext) {
            tagElement.dataset.fullContext = fullContext;
            tagElement.dataset.isAnswerSelection = 'true';
        }

        tagElement.querySelector('.chat-tag-remove').addEventListener('click', () => {
            tagElement.remove();
            this.updateChatStateAfterTagChange();
        });

        mainChatTags.appendChild(tagElement);
        this.updateChatStateAfterTagChange();
    }
    
    // Get full context from the selected text
    getFullContextFromSelection(selectedText) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return null;
        
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        
        // Find the closest content container
        let contentContainer = container.closest('.dust-card__text') || 
                             container.closest('.dust-card__content') ||
                             container.closest('.feedback-content') ||
                             container.closest('.chat-message .message-content');
        
        if (contentContainer) {
            // Get the full text content, removing HTML tags
            const fullText = contentContainer.textContent || contentContainer.innerText || '';
            return fullText.trim();
        }
        
        return null;
    }
    
    updateChatStateAfterTagChange() {
        const mainChatTags = document.getElementById('mainChatTags');
        const floatingChat = document.getElementById('floatingChat');
        const hasTags = mainChatTags.children.length > 0;
        
        if (floatingChat.classList.contains('initial-state')) {
            if (hasTags) {
                this.setChatState('initial-state-with-tag');
            }
        } else if (floatingChat.classList.contains('initial-state-with-tag')) {
            if (!hasTags) {
                this.setChatState('initial-state');
            }
        }
    }
    
    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }
    
    handleDragLeave(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
    }
    
    handleDrop(e, cardId, zoneId) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            this.processFiles(files, cardId, zoneId);
        }
    }
    
    handleFileUpload(e, cardId, zoneId) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            this.processFiles(files, cardId, zoneId);
        }
        e.target.value = ''; // Reset input
    }
    
    handlePaste(e) {
        const items = e.clipboardData.items;
        
        for (let item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    // Find the most recent card and first empty zone for paste
                    const mostRecentCardId = this.currentCardId;
                    const cardData = this.cardData.get(mostRecentCardId);
                    
                    // Find first empty zone
                    for (let i = 1; i <= 3; i++) {
                        if (!cardData.uploadedImages[i]) {
                            this.processFiles([file], mostRecentCardId, i);
                            break;
                        }
                    }
                }
                break;
            }
        }
    }
    
    processFiles(files, cardId, zoneId) {
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) {
            this.showError('Please select image files only.', cardId);
            return;
        }
        
        // Take only the first image for this specific zone
        const file = imageFiles[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            this.addImage(e.target.result, file.name, cardId, zoneId);
        };
        reader.readAsDataURL(file);
    }
    
    addImage(imageDataUrl, filename, cardId, zoneId) {
        const cardData = this.cardData.get(cardId);
        
        // Store image data for this specific zone
        const imageData = { url: imageDataUrl, filename };
        cardData.uploadedImages[zoneId] = imageData;
        
        this.updateUploadDisplay(cardId, zoneId);
    }
    
    removeImage(cardId, zoneId) {
        const cardData = this.cardData.get(cardId);
        delete cardData.uploadedImages[zoneId];
        this.updateUploadDisplay(cardId, zoneId);
    }
    
    updateUploadDisplay(cardId, zoneId = null) {
        const cardData = this.cardData.get(cardId);
        const uploadCard = document.getElementById(`card-${cardId}`);
        const uploadZones = document.querySelector(`#card-${cardId} .upload-zones`);
        
        // Update specific zone if zoneId is provided
        if (zoneId) {
            this.updateZoneDisplay(cardId, zoneId, cardData.uploadedImages[zoneId]);
            } else {
            // Update all zones
            for (let i = 1; i <= 3; i++) {
                this.updateZoneDisplay(cardId, i, cardData.uploadedImages[i]);
            }
        }
        
        // Check if any images are uploaded
        const hasImages = Object.keys(cardData.uploadedImages).length > 0;
        
        if (hasImages) {
            uploadCard.classList.add('with-results');
            uploadCard.classList.remove('without-results');
            // Remove initial state when images are present
            uploadCard.classList.remove('initial-state');
            
            // Add class to manage additional zones
            if (uploadZones) {
                uploadZones.classList.add('has-main-image');
            }
            
            // Hide zones 2 and 3, keep only zone 1 (with image) and show zone 2 as smaller +
            const zone2 = document.getElementById(`uploadZone-${cardId}-2`);
            const zone3 = document.getElementById(`uploadZone-${cardId}-3`);
            
            if (zone2) {
                zone2.style.display = 'flex'; // Show as smaller +
            }
            if (zone3) {
                zone3.style.display = 'none'; // Hide completely
            }
            
            // Hide main floating chat when user inserts a screen to analyze
            const floatingChat = document.getElementById('floatingChat');
            const chatOpenBtn = document.getElementById('chatOpenBtn');
            if (floatingChat) {
                floatingChat.style.display = 'none';
            }
            if (chatOpenBtn) {
                chatOpenBtn.style.display = 'flex';
            }
            // Hide quick action buttons when main chat is hidden
            this.hideQuickActionButtons();
        } else {
            uploadCard.classList.add('without-results');
            uploadCard.classList.remove('with-results');
            // Add initial state when no images are present
            uploadCard.classList.add('initial-state');
            
            // Remove class and show all zones normally
            if (uploadZones) {
                uploadZones.classList.remove('has-main-image');
            }
            
            // Show all zones normally
            const zone2 = document.getElementById(`uploadZone-${cardId}-2`);
            const zone3 = document.getElementById(`uploadZone-${cardId}-3`);
            
            if (zone2) {
                zone2.style.display = 'flex';
            }
            if (zone3) {
                zone3.style.display = 'flex';
            }
            
            // Show main floating chat when no images are present
            const floatingChat = document.getElementById('floatingChat');
            const chatOpenBtn = document.getElementById('chatOpenBtn');
            if (floatingChat) {
                floatingChat.style.display = 'flex';
            }
            if (chatOpenBtn) {
                chatOpenBtn.style.display = 'none';
            }
            // Show quick action buttons when main chat is shown (if not already hidden)
            this.showQuickActionButtons();
        }
    }
    
    updateZoneDisplay(cardId, zoneId, imageData) {
        const uploadContent = document.getElementById(`uploadContent-${cardId}-${zoneId}`);
        const uploadedImage = document.getElementById(`uploadedImage-${cardId}-${zoneId}`);
        const removeBtn = document.getElementById(`removeBtn-${cardId}-${zoneId}`);
        const uploadZone = document.getElementById(`uploadZone-${cardId}-${zoneId}`);
        
        if (imageData) {
            // Show uploaded image
            uploadContent.classList.add('hidden');
            uploadedImage.classList.remove('hidden');
            removeBtn.classList.remove('hidden');
            uploadZone.classList.add('has-image');
            
            uploadedImage.innerHTML = `
                <img src="${imageData.url}" alt="${imageData.filename}">
                <button class="image-action-btn" onclick="event.stopPropagation(); app.addImageToMainChat('${imageData.url}', '${imageData.filename}')">Add to chat</button>
            `;
            
            // Prevent click events on the uploaded image from triggering file input
            const img = uploadedImage.querySelector('img');
            img.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            } else {
            // Show upload prompt
            uploadContent.classList.remove('hidden');
            uploadedImage.classList.add('hidden');
            removeBtn.classList.add('hidden');
            uploadZone.classList.remove('has-image');
        }
    }
    
    async analyzeImages(cardId) {
        const cardData = this.cardData.get(cardId);
        
        if (cardData.isProcessing) {
            return;
        }
        
        // Allow analysis even without images
        
        // Show processing state in the current card
        this.showResults('AI is analyzing your design...', cardId);
        this.showResultsContainer(cardId);
        cardData.isProcessing = true;
        
        try {
            // For now, analyze the first image
            const firstImage = cardData.uploadedImages[0];
            let streamedText = '';
            const msgPayload = firstImage?.url ? [
                { type: 'text', text: 'Analyze this design' },
                { type: 'image_url', image_url: { url: firstImage.url, detail: 'auto' } }
            ] : 'Analyze this design';
            await this.sendChat({
                provider: this.currentProvider,
                model: this.currentModel,
                systemPrompt: this.currentSystemPrompt,
                message: msgPayload,
                history: this.getLastHistory(20),
                onDelta: (delta, full) => {
                    streamedText = full;
                    this.showResults(full, cardId);
                },
                onDone: async (finalText) => {
                    this.appendHistory('Analyze this design', finalText || '');
                    await this.handleCommand(finalText || '');
                }
            });
        } catch (error) {
            console.error('Error:', error);
            this.showResults('Sorry, I encountered an error. Please try again.', cardId);
        } finally {
            cardData.isProcessing = false;
        }
    }
    
    async sendMessage(cardId) {
        if (!this.accessToken) {
            alert('Please sign in to send messages');
            return;
        }
        
        const chatInput = document.getElementById(`chatInput-${cardId}`);
        const chatTags = document.getElementById(`chatTags-${cardId}`);
        const message = chatInput.value.trim();
        
        // Get tags text and handle answer selections
        const tagElements = Array.from(chatTags.querySelectorAll('.chat-tag'));
        let tagsText = '';
        
        for (const tagElement of tagElements) {
            const tagText = tagElement.querySelector('.chat-tag-text').textContent;
            const cardContent = tagElement.cardContent || tagElement.dataset.cardContent;
            const fullContext = tagElement.dataset.fullContext;
            const isAnswerSelection = tagElement.dataset.isAnswerSelection === 'true';
            
            if (cardContent) {
                // Include the full card content for card tags
                tagsText += `[${tagText}]\n${cardContent}\n\n`;
            } else if (isAnswerSelection && fullContext) {
                // Include the full context for answer selections
                tagsText += `[${tagText}]\n${fullContext}\n\n`;
            } else {
                // Regular tag text
                tagsText += tagText + ' ';
            }
        }
        
        const fullMessage = tagsText + message;
        
        if (!fullMessage.trim()) {
            return;
        }
        
        const cardData = this.cardData.get(cardId);
        // Images optional; we proceed even if none are uploaded
        
        // Clear input and tags
        chatInput.value = '';
        chatTags.innerHTML = '';
        
        // Show processing state in the current card
        this.showResults('AI is analyzing your design...', cardId);
        this.showResultsContainer(cardId);
        
        // Start rotating loading messages for this card
        this.startLoadingMessages(`resultsContent-${cardId}`);
        
        cardData.isProcessing = true;

        // Add a pending entry to the card history immediately
        if (!this.conversationHistory.has(cardId)) {
            this.conversationHistory.set(cardId, []);
        }
        const pendingEntry = {
            timestamp: new Date().toISOString(),
            message: fullMessage,
            response: 'AI is analyzing your design…',
            conversationId: this.currentConversationId || null,
        };
        const history = this.conversationHistory.get(cardId);
        history.push(pendingEntry);
        this.showCardChatHistory(cardId);
        
        try {
            // Prepare multimodal message if image present (original format that worked)
            let imageUrl = null;
            const firstKey = Object.keys(cardData.uploadedImages)[0];
            if (firstKey) imageUrl = cardData.uploadedImages[firstKey].url;
            const msgPayload = imageUrl ? [
                { type: 'text', text: fullMessage },
                { type: 'image_url', image_url: { url: imageUrl, detail: 'auto' } }
            ] : fullMessage;

            let streamedText = '';
            await this.sendChat({
                provider: this.currentProvider,
                model: this.currentModel,
                systemPrompt: this.currentSystemPrompt,
                message: msgPayload,
                history: this.getLastHistory(20),
                onDelta: (delta, full) => {
                    streamedText = full;
                    // live render
                    const resultsContent = document.getElementById(`resultsContent-${cardId}`);
                    if (resultsContent) {
                        resultsContent.innerHTML = `<div class="feedback-text">${this.formatContent(full)}</div>`;
                    }
                },
                onDone: async (finalText) => {
                    pendingEntry.response = finalText || 'Done';
                    this.showCardChatHistory(cardId);
                    this.appendHistory(fullMessage, finalText || '');
                    this.stopLoadingMessages();
                    await this.handleCommand(finalText || '');
                    await this.handleCommand(fullMessage);
                }
            });
        } catch (error) {
            console.error('Error:', error);
            this.showResults('Sorry, I encountered an error. Please try again.', cardId);
        } finally {
            cardData.isProcessing = false;
        }
    }
    
    // analyzeDesign is now replaced by sendChat usage inside callers
    
    showResultsContainer(cardId) {
        const resultsContainer = document.getElementById(`resultsContainer-${cardId}`);
        const uploadCard = document.getElementById(`card-${cardId}`);
        resultsContainer.classList.remove('hidden');
        uploadCard.classList.add('with-results');
        uploadCard.classList.remove('without-results');
    }
    
    // Display chat history for a specific card
    showCardChatHistory(cardId) {
        const chatHistoryContent = document.getElementById(`chatHistoryContent-${cardId}`);
        if (!chatHistoryContent) return;
        
        const history = this.conversationHistory.get(cardId) || [];
        if (history.length === 0) {
            chatHistoryContent.innerHTML = '<div class="placeholder-text">No conversation yet</div>';
            return;
        }
        
        const historyHTML = history.map(entry => `
            <div class="chat-message user-message">
                <div class="message-header">
                    <span class="message-sender">You</span>
                    <span class="message-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="message-content">${this.formatContent(entry.message)}</div>
            </div>
            <div class="chat-message agent-message">
                <div class="message-header">
                    <span class="message-sender">AI</span>
                    <span class="message-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="message-content">${this.formatContent(entry.response)}</div>
            </div>
        `).join('');
        
        chatHistoryContent.innerHTML = historyHTML;
        
        // Scroll to bottom
        chatHistoryContent.scrollTop = chatHistoryContent.scrollHeight;
    }
    
    showResults(text, cardId) {
        const resultsContent = document.getElementById(`resultsContent-${cardId}`);
        
        // Try to parse and format the text into different card types
        const parsedContent = this.parseDustOutput(text);
        
        if (parsedContent.cards && parsedContent.cards.length > 0) {
            // Render structured cards
            resultsContent.innerHTML = this.renderStructuredCards(parsedContent.cards);
        } else {
            // Fallback to plain text display
            resultsContent.innerHTML = `<div class="feedback-text">${text}</div>`;
        }
        
        // Ensure results container is visible
        this.showResultsContainer(cardId);
        
        // Update chat history for this card
        this.showCardChatHistory(cardId);
    }
    
    showFeedbackCard() {
        const feedbackCard = document.getElementById('feedbackCard');
        feedbackCard.classList.add('visible');
    }
    
    showFeedback(text) {
        const feedbackContent = document.getElementById('feedbackContent');
        
        // Try to parse and format the text into different card types
        const parsedContent = this.parseDustOutput(text);
        
        if (parsedContent.cards && parsedContent.cards.length > 0) {
            // Render structured cards
            feedbackContent.innerHTML = this.renderStructuredCards(parsedContent.cards);
        } else {
            // Fallback to plain text display
            feedbackContent.innerHTML = `<div class="feedback-text">${text}</div>`;
        }
    }
    
    // Parse Dust output into structured content
    parseDustOutput(text) {
        const cards = [];
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        let currentCard = null;
        let currentContent = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Look for Business, Experience, or Solution headers
            if (this.isBusinessOrExperienceHeader(line)) {
                // Save previous card if exists
                if (currentCard) {
                    currentCard.content = currentContent.join('\n').trim();
                    cards.push(currentCard);
                }
                
                // Start new card
                currentCard = {
                    type: this.detectBusinessOrExperienceType(line),
                    title: this.extractCardTitle(line),
                    content: '',
                    arguments: []
                };
                currentContent = [];
            } else if (currentCard) {
                // Check if this line is a solution (Solution 1, Solution 2, etc.)
                if (this.isSolutionLine(line)) {
                    // Add solution to current card content
                    currentContent.push(line);
                } else {
                    currentContent.push(line);
                }
            }
        }
        
        // Save the last card
        if (currentCard) {
            currentCard.content = currentContent.join('\n').trim();
            // Parse arguments within the card
            currentCard.arguments = this.parseArgumentsInCard(currentCard);
            cards.push(currentCard);
        }
        
        
        return { cards };
    }
    
    // Parse arguments within a card and create individual argument objects
    parseArgumentsInCard(card) {
        const argumentList = [];
        const lines = card.content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        console.log(`Parsing arguments for card: ${card.title}`);
        console.log('Card content lines:', lines);
        
        let currentMainArgument = null;
        let currentMainArgumentContent = [];
        
        for (const line of lines) {
            console.log(`Checking line: "${line}"`);
            console.log(`Is argument line: ${this.isArgumentLine(line)}`);
            console.log(`Is sub-argument line: ${this.isSubArgumentLine(line)}`);
            
            // Check if this line starts a new main argument (like **Header**:)
            if (this.isArgumentLine(line) && line.includes('**') && line.includes(':')) {
                // Save previous main argument if exists
                if (currentMainArgument) {
                    currentMainArgument.content = currentMainArgumentContent.join('\n').trim();
                    argumentList.push(currentMainArgument);
                }
                
                // Start new main argument
                currentMainArgument = {
                    type: this.detectArgumentType(line),
                    title: this.extractArgumentTitle(line),
                    content: line,
                    parentCard: card.title
                };
                currentMainArgumentContent = [line];
                console.log(`Started new main argument: ${currentMainArgument.title}`);
            }
            // Check if this line is a sub-argument (like 🟢 Good: or 🔴 Issue:)
            else if (this.isSubArgumentLine(line)) {
                // Create individual argument for each emoji line
                const subArgument = {
                    type: this.detectArgumentType(line),
                    title: this.extractArgumentTitle(line),
                    content: line,
                    parentCard: card.title
                };
                argumentList.push(subArgument);
                console.log(`Created sub-argument: ${subArgument.title}`);
            }
            // Add content to current main argument
            else if (currentMainArgument) {
                currentMainArgumentContent.push(line);
            }
        }
        
        // Save the last main argument
        if (currentMainArgument) {
            currentMainArgument.content = currentMainArgumentContent.join('\n').trim();
            argumentList.push(currentMainArgument);
        }
        
        console.log(`Parsed ${argumentList.length} arguments for card: ${card.title}`, argumentList);
        return argumentList;
    }
    
    // Check if a line is an argument line (starts with * at any indentation level)
    isArgumentLine(line) {
        // Match lines that start with * followed by either **Title**: or emoji patterns
        return /^\s*\*\s*(\*\*.*\*\*:|[🟢🔴🟡⚪🟠🟣🟤⚫✅❌⚠️💡📋🎯🔍📊📈📉💰🎨🎭🎪🎨🎯🎲🎳🎴🎵🎶🎸🎹🎺🎻🎼🎽🎾🎿🏀🏁🏂🏃🏄🏅🏆🏇🏈🏉🏊🏋🏌🏍🏎🏏🏐🏑🏒🏓🏔🏕🏖🏗🏘🏙🏚🏛🏜🏝🏞🏟🏠🏡🏢🏣🏤🏥🏦🏧🏨🏩🏪🏫🏬🏭🏮🏯🏰🏱🏲🏳🏴🏵🏶🏷🏸🏹🏺🏻🏼🏽🏾🏿])/.test(line);
    }
    
    // Check if a line is a sub-argument line (starts with * and contains emoji)
    isSubArgumentLine(line) {
        // Match lines that start with * and contain emoji patterns (like 🟢 Good:, 🔴 Issue:)
        return /^\s*\*\s*[🟢🔴🟡⚪🟠🟣🟤⚫✅❌⚠️💡📋🎯🔍📊📈📉💰🎨🎭🎪🎨🎯🎲🎳🎴🎵🎶🎸🎹🎺🎻🎼🎽🎾🎿🏀🏁🏂🏃🏄🏅🏆🏇🏈🏉🏊🏋🏌🏍🏎🏏🏐🏑🏒🏓🏔🏕🏖🏗🏘🏙🏚🏛🏜🏝🏞🏟🏠🏡🏢🏣🏤🏥🏦🏧🏨🏩🏪🏫🏬🏭🏮🏯🏰🏱🏲🏳🏴🏵🏶🏷🏸🏹🏺🏻🏼🏽🏾🏿]/.test(line);
    }
    
    // Detect argument type based on content
    detectArgumentType(line) {
        if (line.includes('🟢') || line.includes('Good:')) {
            return 'positive';
        } else if (line.includes('🔴') || line.includes('Issue:')) {
            return 'negative';
        } else if (line.includes('✅') || line.includes('Solution')) {
            return 'suggestion';
        } else if (line.includes('**') && line.includes(':')) {
            // This is a main argument header (like **Profile Gallery**:)
            return 'neutral';
            } else {
            return 'neutral';
        }
    }
    
    // Extract clean title from argument line
    extractArgumentTitle(line) {
        // Remove the * and clean up the title, handling any indentation
        let title = line
            .replace(/^\s*\*\s*/, '')
            .trim();
        
        // Handle **Title**: format
        if (title.includes('**') && title.includes(':')) {
            title = title.replace(/\*\*(.*?)\*\*:.*/, '$1').trim();
        }
        // Handle emoji patterns
        else if (/^[🟢🔴🟡⚪🟠🟣🟤⚫✅❌⚠️💡📋🎯🔍📊📈📉💰🎨🎭🎪🎨🎯🎲🎳🎴🎵🎶🎸🎹🎺🎻🎼🎽🎾🎿🏀🏁🏂🏃🏄🏅🏆🏇🏈🏉🏊🏋🏌🏍🏎🏏🏐🏑🏒🏓🏔🏕🏖🏗🏘🏙🏚🏛🏜🏝🏞🏟🏠🏡🏢🏣🏤🏥🏦🏧🏨🏩🏪🏫🏬🏭🏮🏯🏰🏱🏲🏳🏴🏵🏶🏷🏸🏹🏺🏻🏼🏽🏾🏿]/.test(title)) {
            title = title.replace(/^[🟢🔴🟡⚪🟠🟣🟤⚫✅❌⚠️💡📋🎯🔍📊📈📉💰🎨🎭🎪🎨🎯🎲🎳🎴🎵🎶🎸🎹🎺🎻🎼🎽🎾🎿🏀🏁🏂🏃🏄🏅🏆🏇🏈🏉🏊🏋🏌🏍🏎🏏🏐🏑🏒🏓🏔🏕🏖🏗🏘🏙🏚🏛🏜🏝🏞🏟🏠🏡🏢🏣🏤🏥🏦🏧🏨🏩🏪🏫🏬🏭🏮🏯🏰🏱🏲🏳🏴🏵🏶🏷🏸🏹🏺🏻🏼🏽🏾🏿]\s*/, '')
                .replace(/^:\s*/, '')
                .trim();
        }
        
        return title;
    }
    
    // Detect if a line is a solution line (Solution 1, Solution 2, etc.)
    isSolutionLine(line) {
        const solutionPatterns = [
            /^✅\s*\*\*Solution\s*[12]/i,
            /^Solution\s*[12]\s*:/i,
            /^•\s*Solution\s*[12]/i,
            /^-\s*Solution\s*[12]/i,
            /^\d+\.\s*Solution\s*[12]/i
        ];
        
        return solutionPatterns.some(pattern => pattern.test(line));
    }

    // Detect if a line is a Business, Experience, or Solution header
    isBusinessOrExperienceHeader(line) {
        const businessPatterns = [
            /^#+\s*Business/i,
            /^Business\s*:?/i,
            /^•\s*Business/i,
            /^-\s*Business/i,
            /^\d+\.\s*Business/i,
            /⭐️\s*\*\*Business/i,
            /Business\s*:\s*\d+\/\d+/i
        ];
        
        const experiencePatterns = [
            /^#+\s*Experience/i,
            /^Experience\s*:?/i,
            /^•\s*Experience/i,
            /^-\s*Experience/i,
            /^\d+\.\s*Experience/i,
            /⭐️\s*\*\*Experience/i,
            /Experience\s*:\s*\d+\/\d+/i
        ];
        
        const solutionPatterns = [
            /Most\s+impactful\s+improvement/i
        ];
        
        return businessPatterns.some(pattern => pattern.test(line)) || 
               experiencePatterns.some(pattern => pattern.test(line)) ||
               solutionPatterns.some(pattern => pattern.test(line));
    }
    
    // Detect card type based on Business, Experience, or Solution header
    detectBusinessOrExperienceType(header) {
        const lowerHeader = header.toLowerCase();
        
        if (lowerHeader.includes('business')) {
            return 'business';
        } else if (lowerHeader.includes('experience')) {
            return 'experience';
        } else if (lowerHeader.includes('solution 1')) {
            return 'solution1';
        } else if (lowerHeader.includes('solution 2')) {
            return 'solution2';
        } else if (lowerHeader.includes('most impactful improvement')) {
            return 'solutions'; // Single solutions card for "Most impactful improvement"
            } else {
            return 'general';
        }
    }
    
    // Extract clean title from header
    extractCardTitle(header) {
        return header
            .replace(/^#{1,3}\s+/, '')  // Remove markdown headers
            .replace(/^[•\-]\s+/, '')   // Remove bullet points
            .replace(/^\d+\.\s+/, '')   // Remove numbers
            .replace(/:$/, '')          // Remove trailing colon
            .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove ** from titles
            .trim();
    }
    
    // Render structured cards
    renderStructuredCards(cards) {
        const html = cards.map(card => this.renderCard(card)).join('');
        
        // Add event listeners after a short delay to ensure DOM is updated
        setTimeout(() => {
            this.addButtonEventListeners();
        }, 100);
        
        return html;
    }
    
    // Render individual card
    renderCard(card) {
        switch (card.type) {
            case 'business':
                return this.renderBusinessCard(card);
            case 'experience':
                return this.renderExperienceCard(card);
            case 'solutions':
                return this.renderSolutionsCard(card);
            case 'solution1':
                return this.renderSolution1Card(card);
            case 'solution2':
                return this.renderSolution2Card(card);
            default:
                return this.renderGeneralCard(card);
        }
    }
    
    // Render business card
    renderBusinessCard(card) {
        const argumentsHtml = card.arguments && card.arguments.length > 0 
            ? card.arguments.map(arg => this.renderArgumentCard(arg)).join('')
            : '';
        
        return `
            <div class="dust-card dust-card--business" data-card-type="business" data-card-content="${this.escapeHtml(card.content)}">
                <div class="dust-card__header">
                    <h3 class="dust-card__title">${card.title}</h3>
                </div>
                <div class="dust-card__content">
                    <div class="dust-card__text">${this.formatContent(card.content)}</div>
                    ${argumentsHtml ? `<div class="dust-card__arguments">${argumentsHtml}</div>` : ''}
                </div>
                <button class="dust-card__add-to-chat" data-card-type="${card.type}" data-card-content="${this.escapeHtml(card.content)}">
                    Tag in chat
                </button>
            </div>
        `;
    }
    
    // Render experience card
    renderExperienceCard(card) {
        const argumentsHtml = card.arguments && card.arguments.length > 0 
            ? card.arguments.map(arg => this.renderArgumentCard(arg)).join('')
            : '';
        
        return `
            <div class="dust-card dust-card--experience" data-card-type="experience" data-card-content="${this.escapeHtml(card.content)}">
                <div class="dust-card__header">
                    <h3 class="dust-card__title">${card.title}</h3>
                        </div>
                <div class="dust-card__content">
                    <div class="dust-card__text">${this.formatContent(card.content)}</div>
                    ${argumentsHtml ? `<div class="dust-card__arguments">${argumentsHtml}</div>` : ''}
                </div>
                <button class="dust-card__add-to-chat" data-card-type="${card.type}" data-card-content="${this.escapeHtml(card.content)}">
                    Tag in chat
                </button>
                    </div>
                `;
    }
    
    // Render solution 1 card
    renderSolution1Card(card) {
        return `
            <div class="dust-card dust-card--solution1" data-card-type="solution1" data-card-content="${this.escapeHtml(card.content)}">
                <div class="dust-card__header">
                    <h3 class="dust-card__title">${card.title}</h3>
                </div>
                <div class="dust-card__content">
                    <div class="dust-card__text">${this.formatContent(card.content)}</div>
                </div>
                <button class="dust-card__add-to-chat" data-card-type="${card.type}" data-card-content="${this.escapeHtml(card.content)}">
                    Tag in chat
                </button>
            </div>
        `;
    }
    
    // Render solutions card (combined solutions)
    renderSolutionsCard(card) {
        return `
            <div class="dust-card dust-card--solutions" data-card-type="solutions" data-card-content="${this.escapeHtml(card.content)}">
                <div class="dust-card__header">
                    <h3 class="dust-card__title">${card.title}</h3>
                </div>
                <div class="dust-card__content">
                    <div class="dust-card__text">${this.formatContent(card.content)}</div>
                </div>
                <button class="dust-card__add-to-chat" data-card-type="${card.type}" data-card-content="${this.escapeHtml(card.content)}">
                    Tag in chat
                </button>
            </div>
        `;
    }
    
    // Render solution 2 card
    renderSolution2Card(card) {
        return `
            <div class="dust-card dust-card--solution2" data-card-type="solution2" data-card-content="${this.escapeHtml(card.content)}">
                <div class="dust-card__header">
                    <h3 class="dust-card__title">${card.title}</h3>
                </div>
                <div class="dust-card__content">
                    <div class="dust-card__text">${this.formatContent(card.content)}</div>
                </div>
                <button class="dust-card__add-to-chat" data-card-type="${card.type}" data-card-content="${this.escapeHtml(card.content)}">
                    Tag in chat
                </button>
            </div>
        `;
    }
    
    
    // Render individual argument card
    renderArgumentCard(argument) {
        const argumentClass = `dust-argument dust-argument--${argument.type}`;
        const emoji = this.getArgumentEmoji(argument.type);
        const argumentId = `argument-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        return `
            <div class="${argumentClass}" data-argument-type="${argument.type}" data-argument-content="${this.escapeHtml(argument.content)}">
                <div class="dust-argument__header" onclick="app.toggleArgument('${argumentId}')">
                    <span class="dust-argument__emoji">${emoji}</span>
                    <h4 class="dust-argument__title">${argument.title}</h4>
                    <span class="dust-argument__expand-icon" id="expand-${argumentId}">▼</span>
                </div>
                <div class="dust-argument__content" id="content-${argumentId}" style="display: none;">
                    <div class="dust-argument__text">${this.formatContent(argument.content)}</div>
                </div>
                <button class="dust-argument__add-to-chat" data-argument-title="${this.escapeHtml(argument.title)}" data-argument-content="${this.escapeHtml(argument.content)}" data-parent-card="${this.escapeHtml(argument.parentCard)}">
                    Tag in chat
                </button>
            </div>
        `;
    }
    
    // Get emoji for argument type
    getArgumentEmoji(type) {
        switch (type) {
            case 'positive': return '🟢';
            case 'negative': return '🔴';
            case 'suggestion': return '💡';
            default: return '⚪';
        }
    }
    
    // Add event listeners for all buttons
    addButtonEventListeners() {
        // Add event listeners for main card buttons
        document.querySelectorAll('.dust-card__add-to-chat').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const resultsContainer = button.closest('.results-container');
                const cardId = resultsContainer?.id?.match(/resultsContent-(\d+)/)?.[1] || this.currentCardId;
                const cardType = button.dataset.cardType;
                const cardContent = button.dataset.cardContent;
                this.addCardToChat(cardType, cardContent, cardId);
            });
        });
        
        // Add event listeners for argument buttons
        document.querySelectorAll('.dust-argument__add-to-chat').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const resultsContainer = button.closest('.results-container');
                const cardId = resultsContainer?.id?.match(/resultsContent-(\d+)/)?.[1] || this.currentCardId;
                const title = button.dataset.argumentTitle;
                const content = button.dataset.argumentContent;
                const parentCard = button.dataset.parentCard;
                this.addArgumentToChat(title, content, parentCard, cardId);
            });
        });
    }
    
    // Toggle argument card expansion
    toggleArgument(argumentId) {
        const content = document.getElementById(`content-${argumentId}`);
        const expandIcon = document.getElementById(`expand-${argumentId}`);
        
        if (content.style.display === 'none') {
            content.style.display = 'block';
            expandIcon.textContent = '▲';
        } else {
            content.style.display = 'none';
            expandIcon.textContent = '▼';
        }
    }
    
    // Add argument content to main chat
    addArgumentToChat(title, content, parentCard, cardId) {
        const chatTags = document.getElementById(`chatTags-${cardId || this.currentCardId}`);
        if (!chatTags) return;

        const tagElement = document.createElement('div');
        tagElement.className = 'chat-tag';
        tagElement.innerHTML = `
            <span class="chat-tag-text">${this.getArgumentEmoji(this.detectArgumentType(content))} ${this.escapeHtml(title)}</span>
            <button class="chat-tag-remove" title="Remove">×</button>
        `;

        tagElement.dataset.argumentTitle = title;
        tagElement.dataset.argumentContent = content;
        tagElement.dataset.parentCard = parentCard;

        tagElement.querySelector('.chat-tag-remove').addEventListener('click', () => {
            tagElement.remove();
        });

        chatTags.appendChild(tagElement);
    }
    
    // Render general card for other content
    renderGeneralCard(card) {
        return `
            <div class="dust-card dust-card--general">
                <div class="dust-card__header">
                    <h3 class="dust-card__title">${card.title}</h3>
                </div>
                <div class="dust-card__content">
                    <div class="dust-card__text">${this.formatContent(card.content)}</div>
            </div>
                </div>
            `;
        }
    
    
    // Format content with basic markdown-like formatting
    formatContent(content) {
        // Ensure we have a string
        const text = typeof content === 'string' ? content : this.normalizeContentAsText(content);
        
        // First, handle emoji toggle lists
        let formattedContent = this.createEmojiToggleLists(text);
        
        return formattedContent
            .replace(/\*\*(.*?)\*\*/g, '$1')                   // Remove bold markers from titles
            .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #007bff; text-decoration: underline;">$2</a>')  // Convert markdown links to clickable blue links
            .replace(/\n\n/g, '</p><p>')                       // Paragraphs
            .replace(/\n/g, '<br>')                            // Line breaks
            .replace(/^(.*)$/, '<p>$1</p>');                   // Wrap in paragraph
    }
    
    // Format content without toggle lists (for flow cards)
    formatContentWithoutToggle(content) {
        const text = typeof content === 'string' ? content : this.normalizeContentAsText(content);
        return text
            .replace(/\*\*(.*?)\*\*/g, '$1')                   // Remove bold markers from titles
            .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #007bff; text-decoration: underline;">$2</a>')  // Convert markdown links to clickable blue links
            .replace(/\n\n/g, '</p><p>')                       // Paragraphs
            .replace(/\n/g, '<br>')                            // Line breaks
            .replace(/^(.*)$/, '<p>$1</p>');                   // Wrap in paragraph
    }
    
    // Create toggle lists for lines starting with emojis
    createEmojiToggleLists(content) {
        const base = typeof content === 'string' ? content : this.normalizeContentAsText(content);
        const lines = String(base).split('\n');
        const result = [];
        let i = 0;
        
        while (i < lines.length) {
            const line = lines[i];
            
            // Check if line starts with emoji (expanded regex to catch more emojis)
            if (line.match(/^[🔴🟢✅🔵🟡🟠⚫⚪🟣]/)) {
                // Start of emoji list - collect all consecutive emoji lines
                const emojiLines = [];
                while (i < lines.length && lines[i].match(/^[🔴🟢✅🔵🟡🟠⚫⚪🟣]/)) {
                    emojiLines.push(lines[i]);
                    i++;
                }
                
                // Create toggle list
                const toggleId = `emoji-list-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const toggleList = this.createToggleList(toggleId, emojiLines);
                result.push(toggleList);
            } else {
                // Regular line
                result.push(line);
                i++;
            }
        }
        
        return result.join('\n');
    }
    
    // Create HTML for toggle list
    createToggleList(toggleId, emojiLines) {
        const emojiCount = emojiLines.length;
        
        const listItems = emojiLines.map(line => {
            // Check if line contains markdown links
            if (line.includes('[') && line.includes('](') && line.includes(')')) {
                // Apply link formatting and don't escape HTML
                const formattedLine = line
                    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #007bff; text-decoration: underline;">$2</a>');
                return `<div class="emoji-list-item">${formattedLine}</div>`;
            } else {
                // No links, escape HTML normally
                return `<div class="emoji-list-item">${this.escapeHtml(line)}</div>`;
            }
        }).join('');
        
        return `
            <div class="emoji-toggle-list">
                <div class="emoji-toggle-header" onclick="app.toggleEmojiList('${toggleId}')">
                    <span class="emoji-toggle-text">Detailed analysis</span>
                    <span class="emoji-toggle-count">(${emojiCount} items)</span>
                    <span class="emoji-toggle-icon" id="icon-${toggleId}">▼</span>
                </div>
                <div class="emoji-toggle-content" id="content-${toggleId}" style="display: none;">
                    ${listItems}
                </div>
            </div>
        `;
    }
    
    // Toggle emoji list visibility
    toggleEmojiList(toggleId) {
        const content = document.getElementById(`content-${toggleId}`);
        const icon = document.getElementById(`icon-${toggleId}`);
        const container = content?.closest('.emoji-toggle-list');
        
        if (content && icon && container) {
            if (content.style.display === 'none' || content.style.display === '') {
                content.style.display = 'block';
                icon.textContent = '▲';
                container.classList.add('expanded');
            } else {
                content.style.display = 'none';
                icon.textContent = '▼';
                container.classList.remove('expanded');
            }
        }
    }
    
    // Escape HTML for safe attribute usage
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    
    // Add card content to main chat
    addCardToChat(cardType, content, cardId) {
        const chatTags = document.getElementById(`chatTags-${cardId || this.currentCardId}`);
        if (!chatTags) return;

        // Extract title from content (first line or first sentence)
        const title = this.extractTitleFromContent(content);
        
        
        const tagElement = document.createElement('div');
        tagElement.className = 'chat-tag';
        tagElement.innerHTML = `
            <span class="chat-tag-text">📋 ${this.escapeHtml(title)}</span>
            <button class="chat-tag-remove" title="Remove">×</button>
        `;

        tagElement.dataset.cardType = cardType;
        tagElement.dataset.cardTitle = title;
        // Store content directly as a property to avoid HTML attribute length limits
        tagElement.cardContent = content;

        tagElement.querySelector('.chat-tag-remove').addEventListener('click', () => {
            tagElement.remove();
        });

        chatTags.appendChild(tagElement);
    }
    
    // Extract title from card content
    extractTitleFromContent(content) {
        // Remove HTML tags and get first line
        const textContent = content.replace(/<[^>]*>/g, '').trim();
        const firstLine = textContent.split('\n')[0];
        // Limit to 100 characters for display (increased from 50)
        return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
    }
    
    // Demo function to test the card system
    testCardSystem() {
        const sampleDustOutput = `
Product: Social App | Industry: Consumer Tech | Platform: iOS

⭐️ **Business: 60/100**
*   **Profile Gallery**:
    *   🟢 Good: The photo grid encourages users to showcase their personality, which drives engagement.
    *   🔴 Issue: There are no clear calls to action (like, message, follow), which limits user interaction and potential monetization opportunities.
*   **Value Proposition**:
    *   🔴 Issue: The app's purpose is unclear. Is it for dating, friends, or something else? This ambiguity can lead to high user drop-off.

⭐️ **Experience: 50/100**
*   **Navigation Bar**:
    *   🔴 Issue: The floating profile picture at the bottom is redundant and obstructs the view. The "power" icon's function is ambiguous.
*   **Hierarchy**:
    *   🟢 Good: The layout is clean and minimalist, focusing attention on the user's photos.
    *   🔴 Issue: The user's avatar appears twice (top and bottom), creating redundancy and confusion.
*   **Accessibility**:
    *   🔴 Issue: The "Tap for more" text has low contrast, which could be difficult for users with visual impairments to read.

**Most impactful improvement :**
✅ **Solution 1**: Remove the bottom floating navigation and replace it with a standard iOS tab bar. This will clarify the main actions a user can take.
✅ **Solution 2**: Add social interaction features like "like" or "comment" buttons on photos to increase user engagement and session time.
        `;
        
        // Test with the first card
        const cardId = 1;
        this.showResults(sampleDustOutput, cardId);
        this.showResultsContainer(cardId);
        
        console.log('Business/Experience/Solution card system demo loaded! Check the results area.');
    }
    
    // Test the actual workflow with a simulated Dust response
    testActualWorkflow() {
        const simulatedDustResponse = `
Product: E-commerce App | Industry: Retail | Platform: Web

⭐️ **Business: 75/100**
*   **Conversion Optimization**:
    *   🟢 Good: Clear product showcase with high-quality images drives purchase intent.
    *   🔴 Issue: Checkout process has too many steps, potentially causing cart abandonment.
*   **Revenue Streams**:
    *   🟢 Good: Multiple pricing tiers are clearly presented.
    *   🔴 Issue: No clear upsell opportunities during the checkout flow.

⭐️ **Experience: 80/100**
*   **Navigation**:
    *   🟢 Good: Intuitive category browsing and search functionality.
    *   🟢 Good: Breadcrumb navigation helps users understand their location.
*   **Product Discovery**:
    *   🟢 Good: Filter and sort options make product finding efficient.
    *   🔴 Issue: Product comparison feature is not easily accessible.

**Most impactful improvement :**
✅ **Solution 1**: Streamline the checkout process to 2 steps maximum, reducing friction and increasing conversion rates.
✅ **Solution 2**: Add a product comparison tool in the header navigation to help users make informed decisions.
        `;
        
        // Simulate the actual workflow by calling the same functions that would be called with real Dust responses
        const cardId = 1;
        this.showResults(simulatedDustResponse, cardId);
        this.showResultsContainer(cardId);
        
        console.log('Actual workflow test completed! Check the results area for formatted cards.');
    }
    
    async handleCommand(text) {
        if (!text) return;
        const m = String(text).match(COMMAND_RE);
        console.debug('[COMMAND DETECT]', { textTail: String(text).slice(-160), matched: !!m, groups: m?.slice(1) });
        if (!m) return;

        const app = m[1].toLowerCase().trim();
        const flowAndScreens = m[2].toLowerCase().trim();
        
        // Parse flow and optional screen numbers
        // Format: "Duolingo Onboarding" or "Duolingo Onboarding 01, Duolingo Onboarding 02, Duolingo Onboarding 03"
        const parts = flowAndScreens.split(',').map(p => p.trim());
        const firstPart = parts[0] || '';
        const firstNum = firstPart.match(/(\d+)\s*$/)?.[1] || '';
        const flow = firstPart.replace(/\s*\d+\s*$/, '').trim();
        // Extract numeric tokens from all subsequent parts
        const restNums = parts.slice(1)
            .map(p => (p.match(/(\d+)/)?.[1] || '').trim())
            .filter(Boolean);
        const screenNums = [firstNum, ...restNums].filter(Boolean);

        const inspCard = document.getElementById('inspirationsCard');
        const inspContent = document.getElementById('inspirationsContent');
        if (inspCard) inspCard.style.display = 'flex';
        if (inspContent) inspContent.innerHTML = '<div class="placeholder-text">Finding best match…</div>';

        try {
            console.debug('[INSPIRATIONS REQUEST]', { app, flow, screens: screenNums });

            // Call backend with flow and optional screen numbers
            const resp = await fetch(`${this.backendUrl}/inspirations`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ 
                    recommendation: { 
                        app, 
                        flow,
                        screens: screenNums && screenNums.length ? screenNums : null
                    } 
                })
            });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
            }

            const data = await resp.json();
            console.debug('[INSPIRATIONS RESULT]', data);

            if (!data.ok || !Array.isArray(data.data) || data.data.length === 0) {
                // Check if Perplexity sources are provided
                if (data.sources && data.isPerplexityFallback) {
                    console.log('Using Perplexity sources from backend');
                    this.renderPerplexitySources(data.sources, app, flow, inspContent);
                } else {
                    console.log('No inspirations found in DB and no Perplexity fallback');
                    if (inspContent) {
                        inspContent.innerHTML = '<div class="placeholder-text">No inspirations found.</div>';
                    }
                }
                return;
            }

            this.renderInspirations(data.data, app, flow);
        } catch (e) {
            console.error('inspirations error', e);
            if (inspContent) inspContent.innerHTML = `<div class="placeholder-text">Failed to load inspirations: ${String(e)}</div>`;
        }
    }

    renderPerplexitySources(sources, app, flow, inspContent) {
        if (!inspContent) {
            inspContent = document.getElementById('inspirationsContent');
        }
        
        if (!inspContent) return;
        
        if (!sources || sources.length === 0) {
            inspContent.innerHTML = `
                <div class="flow-group">
                    <div class="flow-title">External inspirations — ${app} ${flow}</div>
                    <div class="placeholder-text">No design sources found.</div>
                    <div class="perplexity-note"><small>Powered by Perplexity</small></div>
                </div>`;
        } else {
            inspContent.innerHTML = `
                <div class="flow-group">
                    <div class="flow-title">External inspirations — ${app} ${flow}</div>
                    <div class="sources-list">
                        ${sources.map(source => `
                            <div class="source-item">
                                <a href="${source.url}" target="_blank" rel="noopener noreferrer" class="source-link">
                                    <div class="source-title">${source.title}</div>
                                    <div class="source-description">${source.description}</div>
                                    <div class="source-url">${source.url}</div>
                                </a>
                            </div>
                        `).join('')}
                    </div>
                    <div class="perplexity-note"><small>Powered by Perplexity • Click links to view designs</small></div>
                </div>`;
        }
    }

    
    // Handle quick action for contextual chat (upload cards)
    handleQuickAction(action, cardId) {
        const chatInput = document.getElementById(`chatInput-${cardId}`);
        if (chatInput) {
            // Map quick actions to more specific prompts
            const actionPrompts = {
                'rate this design': 'Please rate this design and provide detailed feedback on its strengths and areas for improvement.',
                'quick UI check': 'Please perform a quick UI/UX review of this design, focusing on usability, visual hierarchy, and user experience.',
                'find inspirations for this': 'Please find and suggest design inspirations and references that could improve this design.'
            };
            
            const prompt = actionPrompts[action] || action;
            chatInput.value = prompt;
            this.sendMessage(cardId);
        }
    }
    
    // Handle quick action for main chat
    handleMainQuickAction(action) {
        const mainChatInput = document.getElementById('chatInput');
        if (mainChatInput) {
            mainChatInput.value = action;
            this.sendMainChatMessage();
        }
    }
    
    // Hide upload card and show response card when using main chat
    hideUploadCardAndShowResponse() {
        const uploadCardsStack = document.getElementById('uploadCardsStack');
        const feedbackCard = document.getElementById('feedbackCard');
        
        if (uploadCardsStack) {
            uploadCardsStack.style.display = 'none';
        }
        
        // Hard-disable left rating panel
        if (feedbackCard) {
            feedbackCard.classList.remove('visible');
            feedbackCard.style.display = 'none';
        }
    }
    
    // Show response in the feedback card
    showResponseInCard(text) {
        const feedbackContent = document.getElementById('feedbackContent');
        const feedbackCard = document.getElementById('feedbackCard');
        
        if (feedbackCard) {
            feedbackCard.querySelector('.card-title').textContent = 'AI Response';
            // Add compact class for smaller size
            feedbackCard.classList.add('compact');
        }
        
        if (feedbackContent) {
            // Try to parse and format the text into different card types
            const parsedContent = this.parseDustOutput(text);
            
            if (parsedContent.cards && parsedContent.cards.length > 0) {
                // Render structured cards
                feedbackContent.innerHTML = this.renderStructuredCards(parsedContent.cards);
            } else {
                // Fallback to plain text display
                feedbackContent.innerHTML = `<div class="feedback-text">${text}</div>`;
            }
        }
    }
    
    // Hide quick action buttons after first message
    hideQuickActionButtons() {
        const mainQuickActions = document.getElementById('mainQuickActions');
        if (mainQuickActions) {
            mainQuickActions.style.display = 'none';
        }
    }
    
    // Show quick action buttons (only if they haven't been hidden by user interaction)
    showQuickActionButtons() {
        const mainQuickActions = document.getElementById('mainQuickActions');
        if (mainQuickActions) {
            // Only show if they haven't been permanently hidden (e.g., after first message)
            // We can check if the main chat has any history to determine this
            if (this.mainChatHistory.length === 0) {
                mainQuickActions.style.display = 'flex';
            }
        }
    }
    
    // Start rotating loading messages
    startLoadingMessages(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        // Clear any existing interval
        this.stopLoadingMessages();
        
        // Start with first message
        this.currentLoadingIndex = 0;
        element.textContent = this.loadingMessages[this.currentLoadingIndex];
        
        // Set up interval to rotate messages every 3 seconds
        this.loadingInterval = setInterval(() => {
            this.currentLoadingIndex = (this.currentLoadingIndex + 1) % this.loadingMessages.length;
            element.textContent = this.loadingMessages[this.currentLoadingIndex];
        }, 3000);
    }
    
    // Stop rotating loading messages
    stopLoadingMessages() {
        if (this.loadingInterval) {
            clearInterval(this.loadingInterval);
            this.loadingInterval = null;
        }
    }

    // Clean text content by removing HTML/markdown and weird characters
    cleanTextContent(text) {
        if (!text) return '';
        
        return text
            // Remove HTML tags
            .replace(/<[^>]*>/g, '')
            // Remove markdown formatting
            .replace(/\*\*(.*?)\*\*/g, '$1')  // Bold
            .replace(/\*(.*?)\*/g, '$1')      // Italic
            .replace(/`(.*?)`/g, '$1')        // Code
            .replace(/#{1,6}\s*/g, '')        // Headers
            .replace(/^\s*[-*+]\s*/gm, '')    // Bullet points
            .replace(/^\s*\d+\.\s*/gm, '')    // Numbered lists
            // Remove weird characters and clean up
            .replace(/[^\w\s.,!?;:()\-'"]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    // Format Perplexity content for better display
    formatPerplexityContent(content) {
        // First, handle emoji toggle lists
        let formattedContent = this.createEmojiToggleLists(content);
        
        return formattedContent
            .replace(/\*\*(.*?)\*\*/g, '$1')                   // Remove bold markers from titles
            .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: #007bff; text-decoration: underline;">$2</a>')  // Convert markdown links to clickable blue links
            .replace(/\n\n/g, '</p><p>')                       // Paragraphs
            .replace(/\n/g, '<br>')                            // Line breaks
            .replace(/^(.*)$/, '<p>$1</p>');                   // Wrap in paragraph
    }

    renderInspirations(flows, app, flow) {
        const inspContent = document.getElementById('inspirationsContent');
        if (!inspContent) return;
        // Pick the flow with the most screens, ignore empty ones
        const enriched = (flows || []).map(f => ({ ...f, screens: (f.screens||[]).slice().sort((a,b)=>(a.order||0)-(b.order||0)) }));
        const nonEmpty = enriched.filter(f => f.screens && f.screens.length > 0);
        if (nonEmpty.length === 0) {
            // No screens found
            console.log('No screens found in DB');
            if (inspContent) {
                inspContent.innerHTML = '<div class="placeholder-text">No screens found in database.</div>';
            }
            return;
        }
        const best = nonEmpty.sort((a,b) => b.screens.length - a.screens.length)[0];
        // lightweight global retry for broken image URLs (encoding variants)
        if (!window.__retryImg) {
            window.__retryImg = function(imgEl) {
                try {
                    const tried = imgEl.getAttribute('data-tried') || '';
                    const triedSet = new Set(tried.split('|').filter(Boolean));
                    const variants = [];
                    const raw = imgEl.getAttribute('data-raw-url') || imgEl.src || '';
                    // 1) replace spaces
                    variants.push(raw.replace(/\s/g, '%20'));
                    // 2) encode each path segment
                    try {
                        const u = new URL(raw);
                        const segs = u.pathname.split('/').map(p => p === '' ? '' : encodeURIComponent(decodeURIComponent(p)));
                        variants.push(`${u.origin}${segs.join('/')}${u.search || ''}`);
                    } catch {}
                    // 3) double-encode segments (handles already-encoded special chars)
                    try {
                        const u2 = new URL(raw);
                        const segs2 = u2.pathname.split('/').map(p => p === '' ? '' : encodeURIComponent(p));
                        variants.push(`${u2.origin}${segs2.join('/')}${u2.search || ''}`);
                    } catch {}
                    for (const v of variants) {
                        if (!triedSet.has(v)) {
                            triedSet.add(v);
                            imgEl.setAttribute('data-tried', Array.from(triedSet).join('|'));
                            imgEl.src = v;
                            return;
                        }
                    }
                } catch (e) { console.warn('retryImg failed', e); }
            };
        }

        console.debug('[INSPIRATIONS IMAGES]', {
            app: best.appName,
            flow: best.flowName,
            count: best.screens.length,
            urls: best.screens.map(x => x.imageUrl)
        });

        const screensHtml = best.screens.map((s) => {
            const url = String(s.imageUrl || '');
            return `
                <div class=\"flow-screen\"> 
                  <img src=\"${url}\" alt=\"${best.appName} ${best.flowName}\" loading=\"eager\" decoding=\"async\" onerror=\"this.onerror=null; this.src=encodeURI('${url}');\"> 
                </div>`;
        }).join('');

        inspContent.innerHTML = `
          <div class="flow-group">
            <div class="flow-title">${best.appName} — ${best.flowName}</div>
            <div class="flows">${screensHtml}</div>
          </div>`;
    }

    showError(message, cardId = null) {
        console.error(message);
        if (cardId) {
            this.showResults(`Error: ${message}`, cardId);
        } else {
            // Show error in the most recent card
            this.showResults(`Error: ${message}`, this.currentCardId);
        }
    }

    initTrainingDataModal() {
        const trainingDataLink = document.getElementById('trainingDataLink');
        const modal = document.getElementById('trainingDataModal');
        const modalClose = document.getElementById('modalClose');
        const folderUploadZone = document.getElementById('folderUploadZone');
        const folderUpload = document.getElementById('folderUpload');

        // Open modal
        trainingDataLink.addEventListener('click', (e) => {
            e.preventDefault();
            modal.classList.add('active');
        });

        // Close modal
        modalClose.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        // Close modal on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });

        // Handle folder upload
        folderUploadZone.addEventListener('click', () => {
            folderUpload.click();
        });

        folderUpload.addEventListener('change', (e) => {
            this.handleFolderUpload(e.target.files);
        });

        // Drag and drop
        folderUploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            folderUploadZone.classList.add('dragover');
        });

        folderUploadZone.addEventListener('dragleave', () => {
            folderUploadZone.classList.remove('dragover');
        });

        folderUploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            folderUploadZone.classList.remove('dragover');
            this.handleFolderUpload(e.dataTransfer.files);
        });
    }

    async handleFolderUpload(files) {
        if (!files || files.length === 0) return;

        // Group files by folder
        const folders = this.groupFilesByFolder(files);
        
        if (Object.keys(folders).length === 0) {
            alert('No valid folders found. Please select folders containing image files.');
            return;
        }

        // Show progress
        const progressContainer = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const resultsContainer = document.getElementById('uploadResults');
        const resultsContent = document.getElementById('resultsContent');

        progressContainer.style.display = 'block';
        resultsContainer.style.display = 'none';

        let totalFiles = 0;
        let uploadedFiles = 0;
        let results = [];

        // Count total files
        Object.values(folders).forEach(folder => {
            totalFiles += folder.files.length;
        });

        // Upload each folder
        for (const [folderName, folder] of Object.entries(folders)) {
            const appName = this.extractAppName(folderName);
            const flowName = this.extractFlowName(folderName);
            
            progressText.textContent = `Uploading ${folderName}...`;
            
            try {
                const folderResult = await this.uploadFolder(appName, flowName, folder.files, (progress) => {
                    const totalProgress = ((uploadedFiles + progress) / totalFiles) * 100;
                    progressFill.style.width = `${totalProgress}%`;
                });
                
                results.push({
                    folder: folderName,
                    success: true,
                    count: folderResult.count,
                    flowId: folderResult.flowId
                });
                
                uploadedFiles += folder.files.length;
            } catch (error) {
                results.push({
                    folder: folderName,
                    success: false,
                    error: error.message
                });
            }
        }

        // Show results
        progressContainer.style.display = 'none';
        resultsContainer.style.display = 'block';
        
        let resultsHtml = '<div class="results-list">';
        results.forEach(result => {
            if (result.success) {
                resultsHtml += `
                    <div class="result-item success">
                        <strong>✅ ${result.folder}</strong><br>
                        <small>Uploaded ${result.count} files (Flow ID: ${result.flowId})</small>
                    </div>
                `;
            } else {
                resultsHtml += `
                    <div class="result-item error">
                        <strong>❌ ${result.folder}</strong><br>
                        <small>Error: ${result.error}</small>
                    </div>
                `;
            }
        });
        resultsHtml += '</div>';
        
        resultsContent.innerHTML = resultsHtml;
    }

    groupFilesByFolder(files) {
        const folders = {};
        
        Array.from(files).forEach(file => {
            const path = file.webkitRelativePath || file.name;
            const pathParts = path.split('/');
            
            if (pathParts.length >= 2) {
                const folderName = pathParts[0];
                if (!folders[folderName]) {
                    folders[folderName] = { files: [] };
                }
                folders[folderName].files.push(file);
            }
        });
        
        return folders;
    }

    extractAppName(folderName) {
        // Use the entire folder name as the app name
        return folderName;
    }

    extractFlowName(folderName) {
        // Use the entire folder name as the flow name
        return folderName;
    }

    // Smart matching function kept for compatibility (now returns mapped target)
    async findRelevantFlows(query) {
        // Try to split best-effort into app + flow
        const parts = String(query || '').trim().split(/\s+/);
        const appGuess = parts[0] || '';
        const flowGuess = parts.slice(1).join(' ') || '';
        const mapped = mapAppFlow(appGuess, flowGuess);
        console.debug('[SMART MATCHING]', { query, mapped });
        return [`${mapped.app} ${mapped.flow}`];
    }

    async uploadFolder(appName, flowName, files, progressCallback) {
        const SUPABASE_URL = 'https://iiolvvdnzrfcffudwocp.supabase.co';
        const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpb2x2dmRuenJmY2ZmdWR3b2NwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUyMTgwMCwiZXhwIjoyMDczMDk3ODAwfQ.sDlDTwowtdPg2GV9DCl53nSURdYd15iQphrzS1oIcsw';
        const BUCKET = 'flows';

        // Sort files by name
        const sortedFiles = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        let uploadedCount = 0;
        const errors = [];

        for (let i = 0; i < sortedFiles.length; i++) {
            const file = sortedFiles[i];
            const fileNumber = (i + 1).toString().padStart(2, '0');
            const fileExt = file.name.split('.').pop() || 'png';
            const storagePath = `${flowName}/${fileNumber}.${fileExt}`;

            try {
                const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(storagePath)}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${SERVICE_KEY}`
                    },
                    body: file
                });

                if (response.ok) {
                    uploadedCount++;
                } else {
                    const errorText = await response.text();
                    if (!errorText.includes('Duplicate')) {
                        errors.push(`File ${file.name}: ${errorText}`);
                    } else {
                        uploadedCount++; // Count duplicates as success
                    }
                }
            } catch (error) {
                errors.push(`File ${file.name}: ${error.message}`);
            }

            // Update progress
            if (progressCallback) {
                progressCallback(i + 1);
            }
        }

        if (errors.length > 0 && uploadedCount === 0) {
            throw new Error(errors.join('; '));
        }

        return {
            count: uploadedCount,
            flowId: `${appName}_${flowName}_${Date.now()}` // Generate a simple flow ID
        };
    }

    // Normalize any message content (string | array | object) into displayable text
    normalizeContentAsText(raw) {
        try {
            if (raw == null) return '';
            // If backend stored { type, value }
            if (typeof raw === 'object' && !Array.isArray(raw) && raw.value !== undefined) {
                return this.normalizeContentAsText(raw.value);
            }
            // If multimodal array
            if (Array.isArray(raw)) {
                const parts = [];
                for (const item of raw) {
                    if (!item) continue;
                    if (typeof item === 'string') {
                        parts.push(item);
                    } else if (item.type === 'text' && typeof item.text === 'string') {
                        parts.push(item.text);
                    } else if (item.type === 'image_url' && item.image_url?.url) {
                        parts.push(`[image: ${item.image_url.url}]`);
                    } else {
                        parts.push('[unsupported content]');
                    }
                }
                return parts.join('\n');
            }
            // Plain string
            if (typeof raw === 'string') return raw;
            // Fallback
            return JSON.stringify(raw);
        } catch {
            return String(raw || '');
        }
    }

    // Reset main chat UI to the same state as a live conversation view
    resetMainChatUI() {
        try {
            this.setChatState('expanded-state');
        } catch {}
        
        // Hide left "Rating" panel entirely during history view
        const feedbackCard = document.getElementById('feedbackCard');
        const feedbackContent = document.getElementById('feedbackContent');
        if (this._historyView) {
            if (feedbackCard) feedbackCard.style.display = 'none';
        } else {
            // Live flow
            if (feedbackCard) {
                feedbackCard.classList.add('visible');
                feedbackCard.style.display = 'flex';
                const titleEl = feedbackCard.querySelector('.card-title');
                if (titleEl) titleEl.textContent = 'AI Response';
            }
            if (feedbackContent) {
                feedbackContent.innerHTML = '<div class="placeholder-text">Loading conversation…</div>';
            }
        }
        
        // Stop any rotating loaders everywhere
        this.stopLoadingMessages();
        const resultsContentEls = document.querySelectorAll('[id^="resultsContent-"]');
        resultsContentEls.forEach(el => { el.innerHTML = ''; });
        // Hide quick actions to match live state after first message
        this.hideQuickActionButtons();
    }

    async quickPreviewFromMessages(conversationId) {
        // Fetch messages quickly and render the first image immediately, also trigger inspirations
        try {
            const msgs = await this.loadMessages(conversationId);
            if (!Array.isArray(msgs)) return;
            // Find an image in user messages (data url, http url, or image_url object)
            let imgSrc = null;
            for (const m of msgs) {
                if ((m.role || '').toLowerCase() !== 'user') continue;
                const content = (m.content !== undefined ? m.content : m.message);
                // Handle stored {type,value}
                const value = (content && typeof content === 'object' && content.value !== undefined) ? content.value : content;
                if (Array.isArray(value)) {
                    for (const part of value) {
                        if (part?.type === 'image_url' && part.image_url?.url) { imgSrc = part.image_url.url; break; }
                        if (typeof part === 'string' && /^https?:\/\//i.test(part)) { imgSrc = part; break; }
                    }
                } else if (typeof value === 'string') {
                    const dataUrlPattern = /(data:image\/(?:png|jpg|jpeg|gif|webp);base64,[A-Za-z0-9+/=\r\n]+)/i;
                    const httpPattern = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s]*)?)/i;
                    const mm = value.match(dataUrlPattern) || value.match(httpPattern);
                    if (mm) imgSrc = mm[1];
                }
                if (imgSrc) break;
            }
            // Persist for merging during full render as a synthetic first user message
            this._previewImageSrc = imgSrc || null;
            this._previewFirstUserMsg = imgSrc ? { role: 'user', content: `[image: ${imgSrc}]` } : null;
            if (imgSrc) {
                const chatResultsContent = document.getElementById('chatResultsContent');
                if (chatResultsContent) {
                    chatResultsContent.innerHTML = `
                        <div class=\"chat-history-container\">
                            <div class=\"chat-history-content\">
                                <div class=\"chat-message user-message\">
                                    <div class=\"message-header\"><span class=\"message-sender\">You</span><span class=\"message-time\"></span></div>
                                    <div class=\"message-content\"><img src=\"${imgSrc}\" alt=\"image\" style=\"max-width: 260px; border-radius: 10px; display:block;\"></div>
                                </div>
                            </div>
                        </div>`;
                }
            }
            // Trigger inspirations ASAP from the newest assistant/user text
            const newestText = [...msgs].reverse().map(m => {
                const v = (m.content !== undefined ? m.content : m.message);
                const vv = (v && typeof v === 'object' && v.value !== undefined) ? v.value : v;
                if (typeof vv === 'string') return vv; return null;
            }).find(Boolean);
            if (newestText) {
                try { await this.handleCommand(newestText); } catch {}
            }
        } catch (e) {
            console.warn('[PREVIEW] failed', e);
        }
    }

    // Load conversations from database
    async loadConversations() {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }

        try {
            const resp = await fetch(`${this.backendUrl}/conversations`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            if (!resp.ok) {
                throw new Error(`Failed to load conversations: ${resp.status}`);
            }

            const data = await resp.json();
            console.log('[CONVERSATIONS] Loaded conversations:', data);
            return data.conversations || [];
        } catch (error) {
            console.error('[CONVERSATIONS] Error loading conversations:', error);
            throw error;
        }
    }

    // Load messages for a conversation
    async loadMessages(conversationId) {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }

        // Get user from session to ensure proper filtering
        const { data: { user } } = await this.supabaseClient.auth.getUser();
        if (!user) {
            throw new Error('User not authenticated');
        }

        // Query messages directly from Supabase
        const { data: messages, error } = await this.supabaseClient
            .from('messages')
            .select('id, role, content, is_final, chunk_index, created_at')
            .eq('conversation_id', conversationId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });

        console.log('[MESSAGES] Supabase response:', { messages, error, type: typeof messages, isArray: Array.isArray(messages) });

        if (error) {
            console.error('[MESSAGES] Supabase error:', error);
            throw error;
        }

        if (!messages || !Array.isArray(messages)) {
            console.warn('[MESSAGES] No messages or not an array:', messages);
            return [];
        }

        console.log('[MESSAGES] Loaded messages for conversation:', conversationId, messages);
        return messages;
    }

    // Refresh conversations in the history drawer
    async refreshConversationsIntoDrawer() {
        try {
            const conversations = await this.loadConversations();
            this.renderHistoryDrawer(conversations);
        } catch (error) {
            console.error('[HISTORY] Error refreshing conversations:', error);
            const historyList = document.getElementById('historyDrawerList');
            if (historyList) {
                historyList.innerHTML = '<div style="padding:12px;color:#ef4444;">Failed to load conversations</div>';
            }
        }
    }

    // Toggle history drawer visibility
    toggleHistoryDrawer(show = null) {
        const historyDrawer = document.getElementById('historyDrawer');
        if (!historyDrawer) return;

        if (show === null) {
            // Toggle current state
            show = historyDrawer.style.display !== 'block';
        }

        if (show) {
            historyDrawer.style.display = 'block';
            this.refreshConversationsIntoDrawer();
        } else {
            historyDrawer.style.display = 'none';
        }
    }

    // Render the history drawer with conversations
    renderHistoryDrawer(conversations = null) {
        const historyList = document.getElementById('historyDrawerList');
        if (!historyList) return;

        if (conversations) {
            if (conversations.length === 0) {
                historyList.innerHTML = '<div style="padding:12px;color:#666;">No conversations yet</div>';
                return;
            }

            const conversationsHTML = conversations.map(conv => `
                <div class="history-item" data-conversation-id="${conv.id}" style="padding: 8px; border-bottom: 1px solid #eee; cursor: pointer;">
                    <div style="font-weight: bold;">${conv.title || 'Untitled'}</div>
                    <div style="font-size: 12px; color: #666;">${new Date(conv.created_at).toLocaleDateString()}</div>
                </div>
            `).join('');

            historyList.innerHTML = conversationsHTML;

            // Add click listeners to conversation items
            historyList.querySelectorAll('.history-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const conversationId = item.dataset.conversationId;
                    console.log('[HISTORY] Clicked conversation:', conversationId);
                    this.loadConversation(conversationId);
                    this.toggleHistoryDrawer(false);
                });
            });
        } else {
            // Load conversations if not provided
            this.refreshConversationsIntoDrawer();
        }
    }

    // Create a new conversation
    async createConversation() {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }

        try {
            const resp = await fetch(`${this.backendUrl}/conversations`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ title: 'New Conversation' })
            });

            if (!resp.ok) {
                throw new Error(`Failed to create conversation: ${resp.status}`);
            }

            const data = await resp.json();
            console.log('[CONVERSATION] Response data:', data);
            console.log('[CONVERSATION] Response status:', resp.status);
            
            // Handle both response formats: { conversation: {...} } or { id: ... }
            const conversation = data.conversation || data;
            console.log('[CONVERSATION] Parsed conversation:', conversation);
            
            if (!conversation || !conversation.id) {
                throw new Error(`Invalid conversation response: ${JSON.stringify(data)}`);
            }
            
            this.currentConversationId = conversation.id;
            console.log('[CONVERSATION] Created new conversation:', this.currentConversationId);
            return conversation;
        } catch (error) {
            console.error('[CONVERSATION] Error creating conversation:', error);
            throw error;
        }
    }

    // Generate conversation summary from first user message
    generateConversationSummary(message) {
        if (!message) return 'New Conversation';
        
        // Handle multimodal messages
        let textContent = '';
        if (Array.isArray(message)) {
            // Extract text from multimodal message
            textContent = message
                .filter(item => item.type === 'text')
                .map(item => item.text)
                .join(' ')
                .trim();
        } else if (typeof message === 'string') {
            textContent = message;
        }
        
        if (!textContent) return 'New Conversation';
        
        // Create a summary (first 50 characters + ellipsis if longer)
        const summary = textContent.length > 50 
            ? textContent.substring(0, 50).trim() + '...'
            : textContent;
            
        return summary;
    }

    // Update conversation title with summary
    async updateConversationTitle(conversationId, title) {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }

        try {
            const resp = await fetch(`${this.backendUrl}/conversations/${conversationId}`, {
                method: 'PUT',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ title })
            });

            if (!resp.ok) {
                console.warn(`Failed to update conversation title: ${resp.status}`);
                return;
            }

            console.log('[CONVERSATION] Updated title:', title);
        } catch (error) {
            console.error('[CONVERSATION] Error updating title:', error);
        }
    }

    // Send chat message to production Supabase Edge Function
    async sendChat({ provider, model, systemPrompt, message, history, onDelta, onDone }) {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }

        // Create conversation if we don't have one
        if (!this.currentConversationId) {
            await this.createConversation();
        }

        try {
            console.log('[SENDCHAT] Starting chat request to production server');
            console.log('[SENDCHAT] Provider:', provider);
            console.log('[SENDCHAT] Model:', model);
            console.log('[SENDCHAT] Message type:', Array.isArray(message) ? 'multimodal' : 'text');
            console.log('[SENDCHAT] Conversation ID:', this.currentConversationId);

            const resp = await fetch(this.backendUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    conversation_id: this.currentConversationId,
                    message: message,
                    temperature: 0.7,
                    maxTokens: 4000
                })
            });

            console.log('[SENDCHAT] Response status:', resp.status);
            console.log('[SENDCHAT] Response headers:', Object.fromEntries(resp.headers.entries()));

            if (!resp.ok) {
                const errorData = await resp.text();
                console.error('[SENDCHAT] Error response:', errorData);
                throw new Error(`Server error: ${resp.status} ${errorData}`);
            }

            const data = await resp.json();
            console.log('[SENDCHAT] Response data:', data);

            // Call onDelta with the full response immediately
            if (onDelta) {
                onDelta(null, data.response || data.message || '');
            }

            // Call onDone with the final response
            if (onDone) {
                onDone(data.response || data.message || '');
            }

            // Update conversation title with summary from first message
            if (this.currentConversationId && message) {
                const summary = this.generateConversationSummary(message);
                await this.updateConversationTitle(this.currentConversationId, summary);
            }

            return data;

        } catch (error) {
            console.error('[SENDCHAT] Error:', error);
            throw error;
        }
    }

    // Extract image (data URL or http) from possibly multi-line content prefixed with "[image:" and return { imgSrc, strippedText }
    extractImageFromContent(raw) {
        const text = typeof raw === 'string' ? raw : this.normalizeContentAsText(raw);
        if (!text) return { imgSrc: null, strippedText: '' };
        console.log('[EXTRACT] Processing text:', text.substring(0, 200) + '...');
        
        // Grab everything after [image: (multi-line)
        const afterMarker = text.match(/\[image:\s*([\s\S]*)$/i);
        const searchArea = afterMarker ? afterMarker[1] : text;
        console.log('[EXTRACT] Search area:', searchArea.substring(0, 200) + '...');
        
        // Find data URL or http image URL inside
        const dataMatch = searchArea.match(/data:image\/(?:png|jpg|jpeg|gif|webp);base64,[A-Za-z0-9+/=\r\n]+/i);
        const httpMatch = searchArea.match(/https?:\/\/\S+?\.(?:png|jpg|jpeg|gif|webp)(?:\?\S*)?/i);
        const src = (dataMatch ? dataMatch[0] : (httpMatch ? httpMatch[0] : null));
        
        console.log('[EXTRACT] Data match:', !!dataMatch);
        console.log('[EXTRACT] HTTP match:', !!httpMatch);
        console.log('[EXTRACT] Found src:', src ? src.substring(0, 100) + '...' : 'null');
        
        if (!src) return { imgSrc: null, strippedText: text };
        const cleanSrc = src.replace(/\s+/g, '');
        // Remove the marker block and the src from text
        let stripped = text.replace(/\[image:[\s\S]*$/i, '');
        stripped = stripped.replace(src, '').trim();
        
        console.log('[EXTRACT] Clean src:', cleanSrc.substring(0, 100) + '...');
        console.log('[EXTRACT] Stripped text:', stripped.substring(0, 100) + '...');
        
        return { imgSrc: cleanSrc, strippedText: stripped };
    }
}

// Initialize the app when the page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DesignRatingApp();
});