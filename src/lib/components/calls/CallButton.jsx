'use client';

export default function CallButton({ type = 'voice', onClick, disabled }) {
  return (
    <button
      className={`call-button call-${type}`}
      onClick={onClick}
      disabled={disabled}
      title={`Start ${type} call`}
    >
      {type === 'video' ? '📹' : '📞'}
    </button>
  );
}
