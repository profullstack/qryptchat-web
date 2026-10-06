'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { hasRawEmoji, render, selectionOffsets, serialize, setCaret, spliceValue } from '@/lib/emoji/editor-dom.js';

/**
 * A one-field message editor that draws emoji with OpenEmoji images while its
 * value stays plain text. Drop-in for the composer's textarea:
 *   value / onChange(value)   the message text
 *   onSubmit()                Enter (Shift+Enter is a new line)
 *   ref.insert(text)          put text at the caret (the emoji picker)
 *   ref.focus()
 */
const EmojiEditor = forwardRef(function EmojiEditor(
  { value, onChange, onSubmit, onEscape, placeholder = '', disabled = false, className = '', ariaLabel = 'Message' },
  ref
) {
  const el = useRef(null);
  const last = useRef('');
  const composing = useRef(false);
  const caretRef = useRef(null);

  // Keep the DOM in step when the value changes from outside (cleared after send).
  useEffect(() => {
    const root = el.current;
    if (!root || value === last.current) return;
    render(root, value);
    last.current = value;
  }, [value]);

  function commit(next, caret) {
    const root = el.current;
    render(root, next);
    last.current = next;
    if (caret != null && root.ownerDocument.activeElement === root) setCaret(root, caret);
    onChange?.(next);
  }

  useImperativeHandle(ref, () => ({
    focus() {
      el.current?.focus();
    },
    insert(text) {
      const root = el.current;
      if (!root) return;
      const sel = selectionOffsets(root) ?? caretRef.current;
      const { value: next, caret } = spliceValue(last.current, sel, text);
      root.focus();
      commit(next, caret);
    },
  }));

  function handleInput() {
    const root = el.current;
    const next = serialize(root);
    if (!composing.current && hasRawEmoji(root)) {
      // Typed from the OS emoji keyboard or autocorrected: swap in our art, keep the caret.
      const sel = selectionOffsets(root);
      commit(next, sel?.end ?? next.length);
      return;
    }
    last.current = next;
    onChange?.(next);
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape' && onEscape) {
      onEscape();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !composing.current) {
      e.preventDefault();
      onSubmit?.();
      return;
    }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      const { value: next, caret } = spliceValue(last.current, selectionOffsets(el.current), '\n');
      commit(next, caret);
    }
  }

  function handlePaste(e) {
    // Plain text only: no foreign markup in an encrypted message.
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    const { value: next, caret } = spliceValue(last.current, selectionOffsets(el.current), text.replace(/\r\n/g, '\n'));
    commit(next, caret);
  }

  // Remember where the caret was, so the picker (which takes focus) inserts there.
  function rememberCaret() {
    const sel = el.current && selectionOffsets(el.current);
    if (sel) caretRef.current = sel;
  }

  return (
    <div
      ref={el}
      className={`emoji-editor ${className}`}
      contentEditable={!disabled}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      aria-placeholder={placeholder}
      aria-disabled={disabled}
      data-placeholder={placeholder}
      data-empty={value ? 'false' : 'true'}
      spellCheck
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onKeyUp={rememberCaret}
      onMouseUp={rememberCaret}
      onBlur={rememberCaret}
      onPaste={handlePaste}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => {
        composing.current = false;
        handleInput();
      }}
      onDrop={(e) => e.preventDefault()}
    />
  );
});

export default EmojiEditor;
