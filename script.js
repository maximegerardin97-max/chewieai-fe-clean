// Simple Design Rating App
const COMMAND_RE = /command\s*:?\s*send\s+([a-z0-9]+)\s+(.+)/i;

// ------------------------------------------------------------
// Simplified frontend - backend handles all mapping now
// ------------------------------------------------------------

// Backend now handles all mapping - no need for frontend mapping

// Small synonyms pass to make it more tolerant

class DesignRatingApp {
    constructor() {
        this.supabaseUrl = 'https://iiolvvdnzrfcffudwocp.supabase.co';
        this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpb2x2dmRuenJmY2ZmdWR3b2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MjE4MDAsImV4cCI6MjA3MzA5NzgwMH0.2-e8Scn26fqsR11h-g4avH8MWybwLTtcf3fCN9qAgVw';
        this.uploadedImages = [];
        this.isProcessing = false;
        this.currentCardId = 1;
        this.cardData = new Map(); // Store data for each card
        
        // Conversation context management
        this.conversationHistory = new Map(); // cardId -> conversation history
        this.currentConversationId = null; // Current active conversation
        this.mainChatHistory = []; // Centralized main chat history
        
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
        const chatToggleBtn = document.getElementById('chatToggleBtn');
        const chatCloseBtn = document.getElementById('chatCloseBtn');
        const chatOpenBtn = document.getElementById('chatOpenBtn');
        const floatingChat = document.getElementById('floatingChat');
        
        // Send message on button click
        mainSendBtn.addEventListener('click', () => {
            this.sendMainChatMessage();
        });
        
        // Show history on button click
        if (historyBtn) {
            historyBtn.addEventListener('click', () => {
                console.log('History button clicked');
                this.showMainChatHistory();
            });
        } else {
            console.log('History button not found');
        }
        
        // Send message on Enter key
        mainChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMainChatMessage();
            }
        });
        
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
    
    async sendMainChatMessage() {
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
        
        // Find the most recent card with images (optional)
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
            // Use first uploaded image if available; otherwise pass null
            let imageUrl = null;
            if (mostRecentCardId) {
                const cardData = this.cardData.get(mostRecentCardId);
                const firstKey = Object.keys(cardData.uploadedImages)[0];
                if (firstKey) {
                    imageUrl = cardData.uploadedImages[firstKey].url;
                }
            }
            // Check if this is a follow-up question
            const isFollowUp = this.isFollowUpQuestion(message);
            
            const result = await this.analyzeDesign(fullMessage, imageUrl, mostRecentCardId, isFollowUp);
            // Normalize result to object { text, conversationId }
            const resultObj = typeof result === 'string' ? { text: result, conversationId: this.currentConversationId } : result;
            
            // Add to main chat history
            this.mainChatHistory.push({
                timestamp: new Date().toISOString(),
                cardId: mostRecentCardId || 'main-chat',
                message: fullMessage,
                response: resultObj.text || 'Analysis complete',
                conversationId: resultObj.conversationId
            });
            
            // Show response in the response card instead of main chat results
            this.showResponseInCard(resultObj.text || 'Analysis complete');
            
            // Stop loading messages and show final result
            this.stopLoadingMessages();
            
            // Show message history as default in main chat
            this.showMainChatHistory();
            
            // Hide quick action buttons after first message
            this.hideQuickActionButtons();
            
            // Check both the AI response and the original message for commands
            this.handleCommand(resultObj.text || '');
            this.handleCommand(fullMessage);
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
        if (!chatResultsContent || this.mainChatHistory.length === 0) {
            return;
        }
        
        const historyHTML = this.mainChatHistory.map(entry => `
            <div class="chat-message user-message">
                <div class="message-header">
                    <span class="message-sender">You</span>
                    <span class="message-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="message-content">${this.cleanTextContent(entry.message)}</div>
            </div>
            <div class="chat-message agent-message">
                <div class="message-header">
                    <span class="message-sender">AI</span>
                    <span class="message-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="message-content">${this.cleanTextContent(entry.response)}</div>
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
            const result = await this.analyzeDesign('Analyze this design', firstImage.url);
            this.showResults(result, cardId);
            await this.handleCommand(result);
        } catch (error) {
            console.error('Error:', error);
            this.showResults('Sorry, I encountered an error. Please try again.', cardId);
        } finally {
            cardData.isProcessing = false;
        }
    }
    
    async sendMessage(cardId) {
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
            // Check if this is a follow-up question
            const isFollowUp = this.isFollowUpQuestion(message);
            
            // Use first uploaded image if present; otherwise null
            let imageUrl = null;
            const firstKey = Object.keys(cardData.uploadedImages)[0];
            if (firstKey) {
                imageUrl = cardData.uploadedImages[firstKey].url;
            }
            const result = await this.analyzeDesign(fullMessage, imageUrl, cardId, isFollowUp);
            // Normalize result to object { text, conversationId }
            const resultObj = typeof result === 'string' ? { text: result, conversationId: this.currentConversationId } : result;
            // Update pending entry with final response and conversation id
            pendingEntry.response = resultObj.text || 'Analysis complete';
            if (resultObj.conversationId) {
                pendingEntry.conversationId = resultObj.conversationId;
                this.currentConversationId = resultObj.conversationId;
            }
            this.showCardChatHistory(cardId);
            this.showResults(resultObj.text || 'Analysis complete', cardId);
            
            // Stop loading messages for this card
            this.stopLoadingMessages();
            
            // Check both the AI response and the original message for commands
            await this.handleCommand(resultObj.text || '');
            await this.handleCommand(fullMessage);
        } catch (error) {
            console.error('Error:', error);
            this.showResults('Sorry, I encountered an error. Please try again.', cardId);
        } finally {
            cardData.isProcessing = false;
        }
    }
    
    async analyzeDesign(message, imageUrl, cardId = null, isFollowUp = false) {
        console.log('🎨 Starting design analysis...', { message, isFollowUp, cardId });
        
        try {
            // Build context for follow-up questions
            let contextMessage = message;
            if (isFollowUp && cardId) {
                const context = this.getConversationContext(cardId);
                if (context.length > 0) {
                    const contextSummary = context.map(h => 
                        `Previous: ${h.message}\nResponse: ${h.response.substring(0, 200)}...`
                    ).join('\n\n');
                    contextMessage = `Context from previous conversation:\n${contextSummary}\n\nCurrent question: ${message}`;
                }
            }
            
            const payload = {
                action: 'analyze',
                content: contextMessage,
                imageUrl: imageUrl,
                username: 'web-user',
                timezone: 'UTC'
            };
            
            // Add conversation ID for context if we have one
            if (this.currentConversationId) {
                payload.conversationId = this.currentConversationId;
            }
            
            const response = await fetch(`${this.supabaseUrl}/functions/v1/design-brain`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.supabaseKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('✅ Design analysis complete:', result);
            
            if (!result.ok) {
                throw new Error(result.error?.hint || 'Analysis failed');
            }
            
            // Return structured result; caller will update history and UI
            return {
                text: result.data?.text || 'Analysis complete',
                conversationId: result.data?.conversationId || this.currentConversationId || null,
            };
            
        } catch (error) {
            console.error('❌ Design analysis failed:', error);
            throw error;
        }
    }
    
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
                <div class="message-content">${this.cleanTextContent(entry.message)}</div>
            </div>
            <div class="chat-message agent-message">
                <div class="message-header">
                    <span class="message-sender">AI</span>
                    <span class="message-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <div class="message-content">${this.cleanTextContent(entry.response)}</div>
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
        // First, handle emoji toggle lists
        let formattedContent = this.createEmojiToggleLists(content);
        
        return formattedContent
            .replace(/\*\*(.*?)\*\*/g, '$1')                   // Remove bold markers from titles
            .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
            .replace(/\n\n/g, '</p><p>')                       // Paragraphs
            .replace(/\n/g, '<br>')                            // Line breaks
            .replace(/^(.*)$/, '<p>$1</p>');                   // Wrap in paragraph
    }
    
    // Format content without toggle lists (for flow cards)
    formatContentWithoutToggle(content) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '$1')                   // Remove bold markers from titles
            .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
            .replace(/\n\n/g, '</p><p>')                       // Paragraphs
            .replace(/\n/g, '<br>')                            // Line breaks
            .replace(/^(.*)$/, '<p>$1</p>');                   // Wrap in paragraph
    }
    
    // Create toggle lists for lines starting with emojis
    createEmojiToggleLists(content) {
        const lines = content.split('\n');
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
        
        const listItems = emojiLines.map(line => 
            `<div class="emoji-list-item">${this.escapeHtml(line)}</div>`
        ).join('');
        
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
        const flow = m[2].toLowerCase().trim();

        const inspCard = document.getElementById('inspirationsCard');
        const inspContent = document.getElementById('inspirationsContent');
        if (inspCard) inspCard.style.display = 'flex';
        if (inspContent) inspContent.innerHTML = '<div class="placeholder-text">Finding best match…</div>';

        try {
            console.debug('[INSPIRATIONS REQUEST]', { app, flow });

            // Simple call to backend - it handles all mapping now
            const resp = await fetch(`${this.supabaseUrl}/functions/v1/inspirations`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.supabaseKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ recommendation: { app, flow } })
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
            chatInput.value = action;
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
        
        if (feedbackCard) {
            feedbackCard.classList.add('visible');
            feedbackCard.style.display = 'flex';
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
}

// Initialize the app when the page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DesignRatingApp();
});