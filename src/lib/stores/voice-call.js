import { create } from 'zustand';

export const useVoiceCallStore = create((set, get) => ({
  currentCall: null,
  callPermissions: { microphone: false, camera: false },
  callStats: { duration: 0, quality: 'unknown' },

  get isInCall() { return get().currentCall?.state === 'connected'; },
  get hasIncomingCall() {
    const c = get().currentCall;
    return c?.isIncoming && c?.state === 'ringing';
  },
  get isCallInProgress() {
    const c = get().currentCall;
    return c && ['calling', 'ringing', 'connecting', 'connected'].includes(c.state);
  },

  isTorBrowser() {
    return typeof window !== 'undefined' && (
      window.location.hostname.endsWith('.onion') ||
      navigator.userAgent.includes('Tor Browser') ||
      !navigator.permissions
    );
  },

  async checkPermissions() {
    if (get().isTorBrowser()) {
      set({ callPermissions: { microphone: false, camera: false } });
      return { microphone: false, camera: false };
    }
    try {
      const mic = await navigator.permissions.query({ name: 'microphone' });
      const micGranted = mic.state === 'granted';
      let cameraGranted = false;
      try {
        const cam = await navigator.permissions.query({ name: 'camera' });
        cameraGranted = cam.state === 'granted';
      } catch {}
      set({ callPermissions: { microphone: micGranted, camera: cameraGranted } });
      return { microphone: micGranted, camera: cameraGranted };
    } catch {
      set({ callPermissions: { microphone: false, camera: false } });
      return { microphone: false, camera: false };
    }
  },

  async requestPermissions(callType = 'voice') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });
      stream.getTracks().forEach((t) => t.stop());
      await get().checkPermissions();
      return true;
    } catch {
      return false;
    }
  },

  async startCall(participantId, participantName, callType = 'voice', participantAvatar = null) {
    const current = get().currentCall;
    if (current && !['idle', 'ended'].includes(current.state)) {
      throw new Error('Already in a call');
    }
    const hasPermissions = await get().requestPermissions(callType);
    if (!hasPermissions) throw new Error('Media permissions required for calls');
    const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const callSession = {
      id: callId, type: callType, participantId, participantName, participantAvatar,
      state: 'calling', isIncoming: false, isMuted: false,
      isVideoEnabled: callType === 'video', startTime: Date.now(), endTime: null, error: null,
    };
    set({ currentCall: callSession });
    return callSession;
  },

  async acceptCall(callId) {
    const current = get().currentCall;
    if (!current || current.id !== callId || !current.isIncoming) throw new Error('Invalid call');
    const hasPermissions = await get().requestPermissions(current.type);
    if (!hasPermissions) throw new Error('Media permissions required');
    set({ currentCall: { ...current, state: 'connecting' } });
    get()._startCallTimer();
  },

  async endCall(callId) {
    const current = get().currentCall;
    if (!current || current.id !== callId) return;
    get()._stopCallTimer();
    set({ currentCall: { ...current, state: 'ended', endTime: Date.now() } });
    setTimeout(() => set({ currentCall: null }), 3000);
  },

  toggleMute() {
    const current = get().currentCall;
    if (!current) return;
    set({ currentCall: { ...current, isMuted: !current.isMuted } });
  },

  toggleVideo() {
    const current = get().currentCall;
    if (!current || current.type === 'voice') return;
    set({ currentCall: { ...current, isVideoEnabled: !current.isVideoEnabled } });
  },

  handleIncomingCall(callData) {
    const callSession = {
      id: callData.callId || `call-${Date.now()}`,
      type: callData.type || 'voice',
      participantId: callData.from || '',
      participantName: callData.fromName || 'Unknown',
      participantAvatar: callData.fromAvatar || null,
      state: 'ringing', isIncoming: true, isMuted: false,
      isVideoEnabled: (callData.type || 'voice') === 'video',
      startTime: Date.now(), endTime: null, error: null,
    };
    set({ currentCall: callSession });
  },

  formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  _callDurationInterval: null,
  _startCallTimer() {
    const start = Date.now();
    const interval = setInterval(() => {
      set({ callStats: { duration: Math.floor((Date.now() - start) / 1000), quality: 'unknown' } });
    }, 1000);
    set({ _callDurationInterval: interval });
  },
  _stopCallTimer() {
    const { _callDurationInterval } = get();
    if (_callDurationInterval) clearInterval(_callDurationInterval);
    set({ _callDurationInterval: null });
  },
}));

// Legacy export
export const voiceCallManager = {
  startCall: (...args) => useVoiceCallStore.getState().startCall(...args),
  acceptCall: (...args) => useVoiceCallStore.getState().acceptCall(...args),
  endCall: (...args) => useVoiceCallStore.getState().endCall(...args),
  toggleMute: () => useVoiceCallStore.getState().toggleMute(),
  toggleVideo: () => useVoiceCallStore.getState().toggleVideo(),
  handleIncomingCall: (...args) => useVoiceCallStore.getState().handleIncomingCall(...args),
  formatDuration: (...args) => useVoiceCallStore.getState().formatDuration(...args),
};
