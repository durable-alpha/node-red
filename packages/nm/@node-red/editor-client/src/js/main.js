/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

$(function() {
    if ((window.location.hostname !== "localhost") && (window.location.hostname !== "127.0.0.1")) {
        document.title = document.title+" : "+window.location.hostname;
    }
    RED.init({
        apiRootUrl: ""
    });

    // --- Chat Widget Logic Injection ---
    const chatWidget = document.getElementById('red-ui-chat-widget');
    const chatIcon = document.getElementById('red-ui-chat-icon');
    
    if (chatWidget && chatIcon) {
        const chatMessages = document.getElementById('red-ui-chat-messages');
        const chatInput = document.getElementById('red-ui-chat-input');
        const chatSend = document.getElementById('red-ui-chat-send');
        const chatClose = document.getElementById('red-ui-chat-close');
        const chatHeader = document.getElementById('red-ui-chat-header');
        
        // Get the welcome message element and hide it when conversation starts
        const welcomeMessage = chatWidget.querySelector('div[style*="font-weight:600"]');
        let conversationStarted = false;
        let currentResponseTimeout = null; // Track the current response timeout
        let isTyping = false; // Track if bot is currently typing
        let currentTypeInterval = null; // Track the current typing interval
        
        // Chat icon drag variables
        let isIconDragging = false;
        let iconDragOffsetX = 0;
        let iconDragOffsetY = 0;
        let iconWasDragged = false; 
        
        function hideWelcomeMessage() {
            if (welcomeMessage && !conversationStarted) {
                welcomeMessage.style.display = 'none';
                conversationStarted = true;
            }
        }
        
        function appendMessage(text, isUser = false) {
            // Hide welcome message when first message is sent
            if (isUser) {
                hideWelcomeMessage();
            }
            
            // Create wrapper for flex alignment
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.margin = '8px 0';
            wrapper.style.justifyContent = isUser ? 'flex-end' : 'flex-start';

            const div = document.createElement('div');
            div.className = 'chat-message';
            
            if (isUser) {
                // User message with bubble styling
                div.style.cssText = `
                    padding: 8px 12px;
                    border-radius: 12px;
                    background-color: #007acc;
                    color: white;
                    text-align: right;
                    display: inline-block;
                    max-width: 70%;
                    word-wrap: break-word;
                    word-break: break-word;
                `;
                div.innerHTML = text;
                wrapper.appendChild(div);
                chatMessages.appendChild(wrapper);
            } else {
                // AI message with typing effect
                div.style.cssText = `
                    color: #333;
                    max-width: 70%;
                    word-wrap: break-word;
                    word-break: break-word;
                    min-height: 1.2em;
                `;
                div.innerHTML = ''; // Start empty for typing effect
                wrapper.appendChild(div);
                chatMessages.appendChild(wrapper);
                
                // Start typing effect
                typeMessage(div, text);
            }
            
            // Ensure smooth scrolling to bottom
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 10);
        }
        
        function typeMessage(element, text, speed = 30) {
            isTyping = true; // Set typing state to true
            
            // Change send button to pause icon during typing
            const sendIcon = chatSend.querySelector('svg');
            sendIcon.innerHTML = `
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="10,8 16,12 10,16"></polyline>
            `;
            sendIcon.style.cursor = 'pointer'; // Keep it clickable for pausing
            sendIcon.style.opacity = '1';
            chatSend.style.pointerEvents = 'auto'; // Keep it clickable
            
            let index = 0;
            currentTypeInterval = setInterval(() => {
                if (index < text.length) {
                    element.innerHTML += text[index];
                    index++;
                    
                    // Auto-scroll to keep the typing visible
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                } else {
                    clearInterval(currentTypeInterval);
                    currentTypeInterval = null;
                    isTyping = false; // Set typing state to false when done
                    
                    // Re-enable send button after typing is complete
                    sendIcon.innerHTML = `
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    `;
                    sendIcon.style.cursor = 'pointer';
                    sendIcon.style.opacity = '1';
                    chatSend.style.pointerEvents = 'auto';
                }
            }, speed);
        }
        
        function pauseTyping() {
            if (currentTypeInterval) {
                clearInterval(currentTypeInterval);
                currentTypeInterval = null;
                isTyping = false;
                
                // Change pause icon to send icon
                const sendIcon = chatSend.querySelector('svg');
                sendIcon.innerHTML = `
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                `;
                sendIcon.style.cursor = 'pointer';
                sendIcon.style.opacity = '1';
                chatSend.style.pointerEvents = 'auto';
            }
        }
        
        function showLoadingEffect() {
            // Change send button to pause icon (but keep input enabled for typing)
            const sendIcon = chatSend.querySelector('svg');
            sendIcon.innerHTML = `
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="10,8 16,12 10,16"></polyline>
            `;
            sendIcon.style.cursor = 'pointer'; // Keep it clickable for stopping
            sendIcon.style.opacity = '1';
            chatSend.style.pointerEvents = 'auto'; // Keep it clickable
            
            // Create wrapper for flex alignment (same as appendMessage)
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.margin = '8px 0';
            wrapper.style.justifyContent = 'flex-start';

            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'chat-loading';
            loadingDiv.id = 'chat-loading-indicator';
            loadingDiv.style.cssText = `
                padding: 8px 12px;
                border-radius: 12px;
                max-width: 70%;
                background-color: #f0f0f0;
                color: #666;
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            
            const dots = document.createElement('div');
            dots.className = 'loading-dots';
            dots.innerHTML = `
                <span style="animation: loadingDot 1.4s infinite ease-in-out both; animation-delay: -0.32s;">●</span>
                <span style="animation: loadingDot 1.4s infinite ease-in-out both; animation-delay: -0.16s;">●</span>
                <span style="animation: loadingDot 1.4s infinite ease-in-out both;">●</span>
            `;
            dots.style.cssText = `
                display: flex;
                gap: 4px;
                font-size: 12px;
            `;
            
            loadingDiv.appendChild(dots);
            wrapper.appendChild(loadingDiv);
            chatMessages.appendChild(wrapper);
            
            // Ensure smooth scrolling to bottom
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 10);
        }
        
        function hideLoadingEffect() {
            // Clear the timeout if it exists
            if (currentResponseTimeout) {
                clearTimeout(currentResponseTimeout);
                currentResponseTimeout = null;
            }
            
            const sendIcon = chatSend.querySelector('svg');
            sendIcon.innerHTML = `
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            `;
            sendIcon.style.cursor = 'pointer';
            sendIcon.style.opacity = '1';
            chatSend.style.pointerEvents = 'auto';
            
            const loadingIndicator = document.getElementById('chat-loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
        }
        
        function stopResponse() {
            if (currentResponseTimeout) {
                clearTimeout(currentResponseTimeout);
                currentResponseTimeout = null;
            }
            
            if (isTyping) {
                pauseTyping();
            }
            
            hideLoadingEffect();
            
            appendMessage("Response stopped by user.", false);
        }
        
        function openChat() {
            chatWidget.style.display = 'flex';
            chatIcon.style.display = 'none'; 
            chatInput.focus();
            
            setTimeout(() => {
                const widgetHeight = chatWidget.offsetHeight;
                const windowHeight = window.innerHeight;
                const maxHeight = Math.min(80 * windowHeight / 100, 600);
                
                if (widgetHeight > maxHeight) {
                    chatWidget.style.maxHeight = maxHeight + 'px';
                }
            }, 100);
        }
        
        function closeChat() {
            chatWidget.style.display = 'none';
            chatIcon.style.display = 'flex'; 
        }
        
        chatIcon.onclick = function() {
            if (!iconWasDragged) {
                openChat();
            }
            iconWasDragged = false;
        };
        
        chatIcon.addEventListener('mousedown', function(e) {
            e.preventDefault();
            isIconDragging = true;
            iconWasDragged = false; 
            const rect = chatIcon.getBoundingClientRect();
            iconDragOffsetX = e.clientX - rect.left;
            iconDragOffsetY = e.clientY - rect.top;
            document.body.style.userSelect = 'none';
            
            chatIcon.style.transition = 'none';
        });
        
        document.addEventListener('mousemove', function(e) {
            if (isIconDragging) {
                iconWasDragged = true;
                
                let newLeft = e.clientX - iconDragOffsetX;
                let newTop = e.clientY - iconDragOffsetY;
                
                const minLeft = 0;
                const minTop = 0;
                const maxLeft = window.innerWidth - chatIcon.offsetWidth;
                const maxTop = window.innerHeight - chatIcon.offsetHeight;
                
                newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
                newTop = Math.max(minTop, Math.min(newTop, maxTop));
                
                chatIcon.style.left = newLeft + 'px';
                chatIcon.style.top = newTop + 'px';
                chatIcon.style.right = 'auto';
                chatIcon.style.bottom = 'auto';
                chatIcon.style.transform = 'none';
            }
        });
        
        document.addEventListener('mouseup', function() {
            if (isIconDragging) {
                isIconDragging = false;
                document.body.style.userSelect = '';
            }
        });
        
        chatSend.onclick = function(e) {
            e && e.preventDefault && e.preventDefault();
            
            const sendIcon = chatSend.querySelector('svg');
            const isPauseIcon = sendIcon.innerHTML.includes('polyline');
            
            if (isPauseIcon) {
                if (isTyping) {
                    pauseTyping();
                } else {
                    stopResponse();
                }
                return;
            }
            
            const text = chatInput.value.trim();
            if (text) {
                appendMessage(text, true);
                chatInput.value = '';
                chatInput.style.height = '48px'; 
                
                showLoadingEffect();
                
                const thinkingTime = 2000 + Math.random() * 2000;
                currentResponseTimeout = setTimeout(() => {
                    hideLoadingEffect();
                    
                    const responses = [
                        `I understand you're asking about "${text}". Let me help you with that. This is a simulated response that demonstrates the typing effect. The bot appears to be thinking and then types out its response character by character, making the interaction feel more natural and engaging.`,
                        `Great question! "${text}" is an interesting topic. Here's what I can tell you about it: The typing effect creates a more human-like conversation experience. Each character appears individually, simulating how a real person might type their response.`,
                        `Regarding "${text}", here's my analysis: The typing effect adds personality to the bot responses. It makes the conversation feel more dynamic and less robotic. Users can see the response being constructed in real-time.`,
                        `I see you mentioned "${text}". Let me break this down for you: The character-by-character typing creates anticipation and keeps users engaged. It's much more interesting than having the full response appear instantly.`
                    ];
                    
                    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                    appendMessage(randomResponse, false);
                }, thinkingTime);
            }
        };
        
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                
                const sendIcon = chatSend.querySelector('svg');
                const isPauseIcon = sendIcon.innerHTML.includes('polyline');
                
                if (!isPauseIcon) {
                    chatSend.onclick();
                }
            }
        });
        
        chatInput.addEventListener('input', function() {
            chatInput.style.height = '48px';
            chatInput.style.height = (chatInput.scrollHeight) + 'px';
        });
        
        chatClose.onclick = closeChat;
        
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        chatHeader.addEventListener('mousedown', function(e) {
            isDragging = true;
            // Get current position
            const rect = chatWidget.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            document.body.style.userSelect = 'none';
        });
        document.addEventListener('mousemove', function(e) {
            if (isDragging) {
                let newLeft = e.clientX - dragOffsetX;
                let newTop = e.clientY - dragOffsetY;
                // Clamp to viewport
                const minLeft = 0;
                const minTop = 0;
                const maxLeft = window.innerWidth - chatWidget.offsetWidth;
                const maxTop = window.innerHeight - chatWidget.offsetHeight;
                newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
                newTop = Math.max(minTop, Math.min(newTop, maxTop));
                chatWidget.style.left = newLeft + 'px';
                chatWidget.style.top = newTop + 'px';
                chatWidget.style.transform = 'none';
            }
        });
        document.addEventListener('mouseup', function() {
            isDragging = false;
            document.body.style.userSelect = '';
        });
        
        let flowsLoaded = false;
        let completeLoadFinished = false;
        
        RED.events.on("flows:loaded", function() {
            flowsLoaded = true;
            checkReadyToShow();
        });
        
        RED.events.on("completeLoad", function() {
            completeLoadFinished = true;
            checkReadyToShow();
        });
        
        const originalLoaderEnd = RED.loader.end;
        RED.loader.end = function() {
            originalLoaderEnd.call(this); 
            setTimeout(() => {
                completeLoadFinished = true;
                checkReadyToShow();
            }, 500);
        };
        
        function checkReadyToShow() {
            if (flowsLoaded && completeLoadFinished) {
                setTimeout(() => {
                    openChat();
                }, 1000);
            }
        }
        
        setTimeout(() => {
            if (!flowsLoaded || !completeLoadFinished) {
                console.log("StringPilot: Fallback timeout reached, showing chat widget");
                openChat();
            }
        }, 10000); // 10 second fallback
    }
});
