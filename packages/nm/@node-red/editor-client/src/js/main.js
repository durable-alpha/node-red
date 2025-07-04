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
    if (chatWidget) {
        const chatMessages = document.getElementById('red-ui-chat-messages');
        const chatInput = document.getElementById('red-ui-chat-input');
        const chatSend = document.getElementById('red-ui-chat-send');
        const chatClose = document.getElementById('red-ui-chat-close');
        const chatHeader = document.getElementById('red-ui-chat-header');
        
        // Get the welcome message element and hide it when conversation starts
        const welcomeMessage = chatWidget.querySelector('div[style*="font-weight:600"]');
        let conversationStarted = false;
        
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
                `;
                div.innerHTML = text;
            } else {
                // AI message as plain text
                div.style.cssText = `
                    color: #333;
                    max-width: 70%;
                    word-wrap: break-word;
                `;
                div.innerHTML = `${text}`;
            }
            
            wrapper.appendChild(div);
            chatMessages.appendChild(wrapper);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        function showLoadingEffect() {
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
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // Add CSS animation if not already present
            if (!document.getElementById('chat-loading-styles')) {
                const style = document.createElement('style');
                style.id = 'chat-loading-styles';
                style.textContent = `
                    @keyframes loadingDot {
                        0%, 80%, 100% { opacity: 0.3; }
                        40% { opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }
        }
        
        function hideLoadingEffect() {
            const loadingIndicator = document.getElementById('chat-loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
        }
        
        function openChat() {
            chatWidget.style.display = 'flex';
            chatInput.focus();
        }
        
        function closeChat() {
            chatWidget.style.display = 'none';
        }
        
        
        chatSend.onclick = function(e) {
            e && e.preventDefault && e.preventDefault();
            const text = chatInput.value.trim();
            if (text) {
                appendMessage(text, true);
                chatInput.value = '';
                chatInput.style.height = '48px'; // reset height
                
                // Show loading effect
                showLoadingEffect();
                
                // Simulate AI thinking time (2-4 seconds)
                const thinkingTime = 2000 + Math.random() * 2000;
                setTimeout(() => {
                    hideLoadingEffect();
                    appendMessage(text, false); // AI message on the left
                }, thinkingTime);
            }
        };
        
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatSend.onclick();
            }
        });
        // Auto-resize textarea
        chatInput.addEventListener('input', function() {
            chatInput.style.height = '48px';
            chatInput.style.height = (chatInput.scrollHeight) + 'px';
        });
        
        chatClose.onclick = closeChat;
        
        // Keyboard shortcut: Ctrl+Shift+C to open chat
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
                openChat();
            }
        });
        
        // --- Drag and Drop Logic ---
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        let startLeft = 0;
        let startTop = 0;
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
        // --- End Drag and Drop Logic ---
        
        // Wait for Node-RED to fully load before showing StringPilot
        let flowsLoaded = false;
        let completeLoadFinished = false;
        
        // Listen for flows to be loaded
        RED.events.on("flows:loaded", function() {
            flowsLoaded = true;
            checkReadyToShow();
        });
        
        // Listen for complete load to finish
        RED.events.on("completeLoad", function() {
            completeLoadFinished = true;
            checkReadyToShow();
        });
        
        // Alternative: Listen for the loader to end (when loading is complete)
        const originalLoaderEnd = RED.loader.end;
        RED.loader.end = function() {
            originalLoaderEnd.call(this);
            // Add a small delay to ensure everything is fully rendered
            setTimeout(() => {
                completeLoadFinished = true;
                checkReadyToShow();
            }, 500);
        };
        
        function checkReadyToShow() {
            // Show StringPilot when both flows are loaded and complete load is finished
            if (flowsLoaded && completeLoadFinished) {
                // Add a small delay to ensure smooth user experience
                setTimeout(() => {
                    openChat();
                }, 1000);
            }
        }
        
        // Fallback: If events don't fire as expected, show after a reasonable timeout
        setTimeout(() => {
            if (!flowsLoaded || !completeLoadFinished) {
                console.log("StringPilot: Fallback timeout reached, showing chat widget");
                openChat();
            }
        }, 10000); // 10 second fallback
    }
});
