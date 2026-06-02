'use client';

import { useMessagesStore } from '@/lib/stores/messages.js';
import Toast from './Toast.jsx';

export default function ToastContainer() {
  const messages = useMessagesStore((s) => s.messages);
  const remove = useMessagesStore((s) => s.remove);

  if (messages.length === 0) return null;

  return (
    <div className="toast-container">
      {messages.map((msg) => (
        <Toast
          key={msg.id}
          id={msg.id}
          type={msg.type}
          message={msg.message}
          title={msg.title}
          dismissible={msg.dismissible}
          autoDismiss={msg.autoDismiss}
          onDismiss={() => remove(msg.id)}
        />
      ))}
      <style>{`
        .toast-container {
          position: fixed;
          top: 1rem;
          right: 1rem;
          z-index: 9999;
          max-width: 400px;
          width: calc(100vw - 2rem);
        }
      `}</style>
    </div>
  );
}
