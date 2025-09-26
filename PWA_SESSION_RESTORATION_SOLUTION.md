# PWA Session Restoration Solution for Linux/KDE/Wayland

## Problem Analysis

The PWA (Progressive Web App) on Linux/KDE/Wayland environments experiences session loss when the application is minimized. This manifests as:

1. **WebSocket Disconnection**: The WebSocket connection drops when the PWA is minimized
2. **Session Expiration**: Authentication sessions become invalid during extended minimization
3. **Chat Window Loading Issues**: After reconnection, the message list loads but individual chats fail to load properly
4. **Incomplete Reconnection**: The reconnection process doesn't fully restore the application state

## Root Causes Identified

### 1. WebSocket Connection Management
- **Issue**: Basic reconnection logic with linear backoff
- **Problem**: No heartbeat mechanism to detect stale connections
- **Impact**: Connection appears active but is actually broken

### 2. Session Validation
- **Issue**: No session validation on app resume
- **Problem**: Expired tokens not refreshed automatically
- **Impact**: API calls fail silently

### 3. PWA State Management
- **Issue**: No visibility API integration
- **Problem**: App doesn't detect when it's minimized/restored
- **Impact**: No proactive session management

### 4. Error Recovery
- **Issue**: Limited error handling for connection failures
- **Problem**: No graceful degradation or user feedback
- **Impact**: Users experience broken functionality without clear indication

## Solution Implementation

### 1. Enhanced WebSocket Management (`src/lib/stores/websocket-chat.js`)

#### Features Implemented:
- **Exponential Backoff**: Intelligent reconnection with increasing delays
- **Heartbeat System**: Regular ping/pong to detect connection health
- **Connection State Tracking**: Comprehensive state management
- **Token Management**: Automatic token refresh on reconnection

#### Key Improvements:
```javascript
// Enhanced reconnection with exponential backoff
function calculateReconnectDelay() {
    const baseDelay = reconnectDelay;
    const exponentialDelay = baseDelay * Math.pow(2, reconnectAttempts);
    const cappedDelay = Math.min(exponentialDelay, maxReconnectDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * 0.25 * (Math.random() - 0.5);
    return Math.floor(cappedDelay + jitter);
}

// Heartbeat system for connection health
function startHeartbeat() {
    heartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const timeSinceLastHeartbeat = Date.now() - (lastHeartbeat || 0);
            
            if (timeSinceLastHeartbeat > 60000) {
                console.log('⚠️ No heartbeat received, connection may be stale');
                ws.close(); // Force reconnection
            } else {
                ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            }
        }
    }, 30000);
}
```

### 2. PWA Session Manager (`src/lib/utils/pwa-session-manager.js`)

#### Features Implemented:
- **Visibility API Integration**: Detects app minimization/restoration
- **Session Validation**: Automatic session refresh on app resume
- **State Persistence**: Saves and restores app state across sessions
- **Connection Recovery**: Coordinates WebSocket reconnection

#### Key Features:
```javascript
// Visibility change handling
async function handleVisibilityChange() {
    const isHidden = document.hidden;
    
    if (isHidden) {
        // App is being minimized
        this.appState.isVisible = false;
        this.appState.wasMinimized = true;
        this.saveAppState();
    } else {
        // App is being restored
        const timeSinceMinimized = Date.now() - this.appState.lastActiveTime;
        
        if (this.appState.wasMinimized && timeSinceMinimized > 30000) {
            await this.validateAndRestoreSession();
        }
    }
}

// Session validation and restoration
async function validateAndRestoreSession() {
    const isSessionValid = await this.validateSession();
    
    if (!isSessionValid) {
        this.handleSessionExpired();
        return false;
    }
    
    await this.ensureWebSocketConnection();
    return true;
}
```

### 3. Enhanced Authentication Store (`src/lib/stores/auth.js`)

#### Improvements Made:
- **Session Refresh Logic**: Automatic token refresh with retry logic
- **Session Validation**: Comprehensive session state checking
- **Error Handling**: Graceful handling of expired sessions

#### Key Features:
```javascript
// Enhanced session refresh with error handling
async refreshSession(refreshToken) {
    try {
        const supabase = createSupabaseClient();
        const { data, error } = await supabase.auth.refreshSession({
            refresh_token: refreshToken
        });

        if (error || !data.session) {
            return { success: false, error: error?.message || 'Failed to refresh session' };
        }

        if (browser) {
            localStorage.setItem('qrypt_session', JSON.stringify(data.session));
        }

        return { success: true, session: data.session };
    } catch (error) {
        return { success: false, error: 'Failed to refresh session' };
    }
}
```

### 4. Chat Page Integration (`src/routes/chat/+page.svelte`)

#### Features Added:
- **PWA Session Manager Integration**: Automatic session restoration
- **Connection Recovery**: Handles connection failures gracefully
- **Error Recovery**: User-friendly error handling and recovery

#### Key Integration:
```javascript
// PWA session handling setup
function setupPWASessionHandling() {
    const handleVisibilityChange = async () => {
        if (!document.hidden && pwaSessionManager.isInProblematicState()) {
            await handleConnectionRecovery();
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
}

// Connection recovery after PWA resume
async function handleConnectionRecovery() {
    try {
        pwaSessionManager.resetConnectionState();
        wsChat.resetConnectionState();
        
        const sessionValid = await pwaSessionManager.forceSessionValidation();
        
        if (sessionValid) {
            wsChat.forceReconnect();
            
            if (activeConversationId) {
                await handleConversationSelect(activeConversationId);
            }
        }
    } catch (error) {
        console.error('❌ Connection recovery failed:', error);
    }
}
```

### 5. Diagnostic Tools (`src/lib/utils/pwa-diagnostics.js`)

#### Features Implemented:
- **Comprehensive Diagnostics**: Environment, session, WebSocket, and PWA state analysis
- **Issue Detection**: Automatic identification of common problems
- **Recommendations**: Actionable suggestions for problem resolution
- **Debug Integration**: Keyboard shortcut (Ctrl+Shift+D) for quick diagnostics

#### Key Features:
```javascript
// Comprehensive diagnostic collection
async runDiagnostics() {
    await this.collectEnvironmentInfo();
    await this.collectSessionInfo();
    await this.collectWebSocketInfo();
    await this.collectPWAInfo();
    await this.collectBrowserInfo();
    
    const issues = this.identifyIssues();
    const recommendations = this.generateRecommendations(issues);
    
    return { ...this.diagnosticData, issues, recommendations };
}

// Linux/KDE/Wayland specific detection
collectEnvironmentInfo() {
    const ua = navigator.userAgent.toLowerCase();
    this.diagnosticData.environment.isLinux = ua.includes('linux');
    this.diagnosticData.environment.isKDE = ua.includes('kde');
    this.diagnosticData.environment.isWayland = process?.env?.XDG_SESSION_TYPE === 'wayland';
}
```

## Testing Strategy

### 1. Unit Tests (`tests/pwa-session-integration.test.js`)
- Session storage and validation
- Reconnection logic verification
- PWA state detection
- Error recovery scenarios

### 2. Integration Tests
- End-to-end session restoration flow
- WebSocket reconnection scenarios
- PWA minimization/restoration cycles

### 3. Manual Testing Scenarios
- Install PWA on Linux/KDE/Wayland
- Minimize app for extended periods
- Test reconnection after network changes
- Verify chat functionality after restoration

## Deployment Considerations

### 1. Backward Compatibility
- All changes are additive and don't break existing functionality
- Graceful degradation for browsers without PWA support

### 2. Performance Impact
- Minimal overhead from heartbeat system (30-second intervals)
- Efficient state management with localStorage
- Optimized reconnection logic to prevent excessive attempts

### 3. User Experience
- Transparent session restoration
- Clear error messages when recovery fails
- Diagnostic tools for troubleshooting

## Monitoring and Maintenance

### 1. Logging
- Comprehensive console logging for debugging
- Error tracking for failed reconnections
- Performance metrics for connection health

### 2. Diagnostics
- Built-in diagnostic tools accessible via keyboard shortcut
- Automatic issue detection and recommendations
- Export functionality for support cases

### 3. Future Improvements
- Server-side session management enhancements
- Advanced PWA lifecycle management
- Machine learning for connection pattern optimization

## Usage Instructions

### For Users
1. **Install PWA**: Install the app as PWA on Linux/KDE/Wayland
2. **Normal Usage**: Use the app normally - session restoration is automatic
3. **Troubleshooting**: Press Ctrl+Shift+D for diagnostic information
4. **Recovery**: If issues persist, refresh the page or restart the PWA

### For Developers
1. **Enable Diagnostics**: Use `pwaDiagnostics.runDiagnostics()` in console
2. **Monitor Logs**: Check console for session restoration events
3. **Debug Issues**: Use diagnostic tools to identify specific problems
4. **Test Scenarios**: Simulate minimization/restoration cycles

## Success Metrics

### 1. Technical Metrics
- **Reconnection Success Rate**: >95% successful reconnections
- **Session Restoration Time**: <5 seconds average
- **Connection Stability**: <1% stale connection rate

### 2. User Experience Metrics
- **Seamless Restoration**: Users don't notice session loss
- **Chat Functionality**: Full chat loading after restoration
- **Error Recovery**: Clear feedback when manual intervention needed

## Conclusion

This comprehensive solution addresses the PWA session loss issue on Linux/KDE/Wayland by implementing:

1. **Robust WebSocket Management** with exponential backoff and heartbeat
2. **Intelligent Session Management** with automatic validation and refresh
3. **PWA-Aware State Management** using Visibility API
4. **Comprehensive Error Recovery** with user-friendly feedback
5. **Advanced Diagnostic Tools** for troubleshooting

The solution is designed to be transparent to users while providing developers with the tools needed to monitor and maintain connection stability.