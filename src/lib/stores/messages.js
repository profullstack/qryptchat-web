import { create } from 'zustand';

function generateId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const useMessagesStore = create((set, get) => ({
  messages: [],

  add(type, message, options = {}) {
    const id = generateId();
    const newMessage = {
      id,
      type,
      message,
      title: options.title,
      dismissible: options.dismissible ?? true,
      autoDismiss: options.autoDismiss ?? 0,
      timestamp: Date.now(),
    };
    set((state) => ({ messages: [...state.messages, newMessage] }));
    return id;
  },

  info(message, options = {}) {
    return get().add('info', message, options);
  },

  success(message, options = {}) {
    return get().add('success', message, { autoDismiss: 5000, ...options });
  },

  warning(message, options = {}) {
    return get().add('warning', message, options);
  },

  error(message, options = {}) {
    return get().add('error', message, options);
  },

  remove(id) {
    set((state) => ({ messages: state.messages.filter((m) => m.id !== id) }));
  },

  clear() {
    set({ messages: [] });
  },
}));

// Legacy compat: expose a singleton-style object
export const messages = {
  add: (...args) => useMessagesStore.getState().add(...args),
  info: (...args) => useMessagesStore.getState().info(...args),
  success: (...args) => useMessagesStore.getState().success(...args),
  warning: (...args) => useMessagesStore.getState().warning(...args),
  error: (...args) => useMessagesStore.getState().error(...args),
  remove: (...args) => useMessagesStore.getState().remove(...args),
  clear: () => useMessagesStore.getState().clear(),
};
