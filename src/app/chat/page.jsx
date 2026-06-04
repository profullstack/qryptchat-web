'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth.js';
import { useChatStore } from '@/lib/stores/chat.js';
import { useShallow } from 'zustand/react/shallow';
import ChatSidebar from '@/lib/components/ChatSidebar.jsx';
import MessageList from '@/lib/components/chat/MessageList.jsx';
import MessageInput from '@/lib/components/chat/MessageInput.jsx';
import AddParticipantModal from '@/lib/components/chat/AddParticipantModal.jsx';
import EncryptionWarning from '@/lib/components/EncryptionWarning.jsx';
import MLKEMCallInterface from '@/lib/components/calls/MLKEMCallInterface.jsx';
import { MLKEMCallManager, CALL_STATES } from '@/lib/webrtc/ml-kem-call-manager.js';
import { callAudioManager } from '@/lib/audio/call-sounds.js';
import { pwaSessionManager } from '@/lib/utils/pwa-session-manager.js';
import '@/lib/debug/encryption-debug.js';

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => !!s.user);
  const { connect, connected } = useChatStore(
    useShallow((s) => ({ connect: s.connect, connected: s.connected }))
  );

  const [activeConversationId, setActiveConversationId] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [mlkemCallManager, setMlkemCallManager] = useState(null);
  const [showCallInterface, setShowCallInterface] = useState(false);
  const [callState, setCallState] = useState(CALL_STATES.IDLE);

  useEffect(() => {
    if (!isAuthenticated) { router.replace('/auth'); return; }
    if (!connected) initWebSocket();
    setupPWASessionHandling();

    const welcome = searchParams.get('welcome') === 'true';
    setShowWelcome(welcome);
    if (welcome) setTimeout(() => setShowWelcome(false), 5000);

    const convParam = searchParams.get('conversation');
    if (convParam) handleConversationSelect(convParam);
  }, [isAuthenticated]);

  async function initWebSocket() {
    try {
      const stored = localStorage.getItem('qrypt_session');
      if (!stored) { await handleSessionError(); return; }
      const session = JSON.parse(stored);
      if (session.access_token) connect(session.access_token);
      else await handleSessionError();
    } catch { await handleSessionError(); }
  }

  function setupPWASessionHandling() {
    const handler = async () => {
      if (!document.hidden && pwaSessionManager.isInProblematicState()) {
        await handleConnectionRecovery();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }

  async function handleSessionError() {
    try {
      const sessionResult = await useAuthStore.getState().getCurrentSession();
      if (sessionResult.session) connect(sessionResult.session.access_token);
      else router.replace('/auth');
    } catch { router.replace('/auth'); }
  }

  async function handleConnectionRecovery() {
    try {
      pwaSessionManager.resetConnectionState();
      const valid = await pwaSessionManager.forceSessionValidation();
      if (!valid) router.replace('/auth');
    } catch {}
  }

  async function handleConversationSelect(conversationId) {
    setActiveConversationId(conversationId);
    if (user?.id) {
      try {
        await fetch(`/api/chat/conversations/${conversationId}/mark-read`, { method: 'POST', credentials: 'include' });
      } catch {}
    }
    if (window.innerWidth <= 768) setShowSidebar(false);
    useChatStore.getState().joinConversation(conversationId);
  }

  async function handleMLKEMVoiceCall() {
    if (!currentConversation) return;
    try {
      const other = currentConversation.participants?.find((p) => p.id !== user?.id);
      if (!other?.id) { alert('Cannot start call: No valid participant found'); return; }
      let mgr = mlkemCallManager;
      if (!mgr) { mgr = new MLKEMCallManager(null); setMlkemCallManager(mgr); setupCallManagerSub(mgr); }
      await mgr.initiateCall(other.id, false);
    } catch (err) { alert(`Failed to start encrypted voice call: ${err.message}`); }
  }

  async function handleMLKEMVideoCall() {
    if (!currentConversation) return;
    try {
      const other = currentConversation.participants?.find((p) => p.id !== user?.id);
      if (!other?.id) { alert('Cannot start call: No valid participant found'); return; }
      let mgr = mlkemCallManager;
      if (!mgr) { mgr = new MLKEMCallManager(null); setMlkemCallManager(mgr); setupCallManagerSub(mgr); }
      await mgr.initiateCall(other.id, true);
    } catch (err) { alert(`Failed to start encrypted video call: ${err.message}`); }
  }

  function setupCallManagerSub(mgr) {
    mgr.callState.subscribe((state) => {
      setCallState(state);
      if (state === CALL_STATES.RINGING) callAudioManager.startRinging();
      else callAudioManager.stopRinging();
      setShowCallInterface(state !== CALL_STATES.IDLE);
    });
  }

  const canAddParticipants = currentConversation && ['group', 'direct'].includes(currentConversation.type);

  if (!isAuthenticated) return null;

  return (
    <div className="chat-container">
      {showWelcome && (
        <div className="welcome-banner">
          <div className="welcome-content">
            <h2>🎉 Welcome to QryptChat, {user?.displayName || user?.username}!</h2>
            <p>Your account has been created successfully. Start chatting securely!</p>
          </div>
          <button className="close-welcome" onClick={() => setShowWelcome(false)}>×</button>
        </div>
      )}

      <EncryptionWarning />

      <div className="chat-layout">
        <div className={`sidebar-container${showSidebar ? ' show' : ''}`}>
          <ChatSidebar
            activeConversationId={activeConversationId}
            onConversationSelect={handleConversationSelect}
          />
        </div>

        <div className={`chat-main${(!showSidebar || !activeConversationId) ? ' show' : ''}`}>
          {activeConversationId ? (
            <div className="chat-interface">
              <div className="chat-header">
                <button className="back-button" onClick={() => { setShowSidebar(true); setActiveConversationId(null); setCurrentConversation(null); }}>← Back</button>
                <div className="conversation-title">{currentConversation?.name || 'Chat'}</div>
                <div className="header-actions">
                  <button className="header-action-btn voice-call-btn" onClick={handleMLKEMVoiceCall} title="Encrypted voice call">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  </button>
                  <button className="header-action-btn video-call-btn" onClick={handleMLKEMVideoCall} title="Encrypted video call">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  </button>
                  {canAddParticipants && (
                    <button className="header-action-btn" onClick={() => setShowAddParticipantModal(true)} title="Add participants">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    </button>
                  )}
                  <button className="header-action-btn menu-button" onClick={() => setShowSidebar(!showSidebar)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                  </button>
                </div>
              </div>
              <MessageList conversationId={activeConversationId} />
              <MessageInput conversationId={activeConversationId} />
            </div>
          ) : (
            <div className="chat-welcome">
              <div className="welcome-icon">🔐</div>
              <h2>Welcome to QryptChat</h2>
              <p>Your messages are protected with quantum-resistant encryption</p>
              <p className="select-chat-hint">Select a conversation from the sidebar to start chatting</p>
            </div>
          )}
        </div>
      </div>

      {showAddParticipantModal && (
        <AddParticipantModal
          isOpen={showAddParticipantModal}
          conversationId={activeConversationId}
          onClose={() => setShowAddParticipantModal(false)}
          onParticipantsAdded={() => setShowAddParticipantModal(false)}
        />
      )}

      <style>{`
        .chat-container { height: calc(100vh - 4rem); height: calc(100dvh - 4rem); display: flex; flex-direction: column; }
        .welcome-banner { background: linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-secondary)); color: white; padding: 1rem; display: flex; align-items: center; justify-content: space-between; }
        .welcome-content h2 { margin: 0 0 .25rem; font-size: 1.125rem; font-weight: 600; }
        .welcome-content p { margin: 0; opacity: .9; font-size: .875rem; }
        .close-welcome { background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer; }
        .chat-layout { display: flex; flex: 1; overflow: hidden; position: relative; }
        .sidebar-container { flex-shrink: 0; }
        .chat-main { flex: 1; display: flex; align-items: center; justify-content: center; background: var(--color-bg-primary); overflow: hidden; position: relative; }
        .chat-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem; background: var(--color-bg-primary); border-bottom: 1px solid var(--color-border-primary); position: sticky; top: 0; z-index: 10; min-height: 60px; flex-shrink: 0; width: 100%; }
        .back-button { display: none; background: none; border: none; color: var(--color-text-primary); cursor: pointer; font-size: 1rem; padding: .5rem; border-radius: .375rem; }
        .header-actions { display: flex; align-items: center; gap: .5rem; }
        .conversation-title { font-weight: 600; color: var(--color-text-primary); flex: 1; text-align: center; }
        .header-action-btn { background: none; border: none; color: var(--color-text-primary); cursor: pointer; padding: .5rem; border-radius: .375rem; display: flex; align-items: center; justify-content: center; min-width: 36px; height: 36px; }
        .header-action-btn:hover { background: var(--color-bg-secondary); }
        .voice-call-btn { color: var(--color-success); }
        .voice-call-btn:hover { background: var(--color-success); color: white; }
        .video-call-btn { color: var(--color-brand-primary); }
        .video-call-btn:hover { background: var(--color-brand-primary); color: white; }
        .chat-interface { flex: 1; display: flex; flex-direction: column; height: 100%; background: var(--color-bg-primary); position: relative; padding-bottom: 100px; }
        .chat-welcome { text-align: center; max-width: 500px; padding: 2rem; }
        .welcome-icon { font-size: 4rem; margin-bottom: 1rem; }
        .chat-welcome h2 { font-size: 1.875rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: .5rem; }
        .chat-welcome > p { color: var(--color-text-secondary); margin-bottom: 1rem; }
        .select-chat-hint { font-size: .875rem; font-style: italic; }
        @media (max-width: 768px) {
          .back-button { display: flex; }
          .sidebar-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 20; transform: translateX(-100%); transition: transform .3s ease; }
          .sidebar-container.show { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>}>
      <ChatPageInner />
    </Suspense>
  );
}
