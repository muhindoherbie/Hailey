export type Accessory = 'none' | 'crown' | 'chef' | 'cap' | 'headband' | 'party';

/** Small hand-drawn extras that sit on top of the orb. Earned through use (see useMascot). */
function AccessoryArt({ kind }: { kind: Accessory }) {
  if (kind === 'crown') {
    return (
      <svg viewBox="0 0 100 60" className="hl-acc hl-acc-crown" aria-hidden="true">
        <path d="M10 52 L16 16 L34 34 L50 8 L66 34 L84 16 L90 52 Z" fill="#f6c453" stroke="#c98d16" strokeWidth="3" strokeLinejoin="round" />
        <rect x="12" y="46" width="76" height="10" rx="4" fill="#e9a92c" stroke="#c98d16" strokeWidth="3" />
        <circle cx="50" cy="8" r="5" fill="#fff3c4" stroke="#c98d16" strokeWidth="2.5" />
        <circle cx="16" cy="16" r="4" fill="#fff3c4" stroke="#c98d16" strokeWidth="2.5" />
        <circle cx="84" cy="16" r="4" fill="#fff3c4" stroke="#c98d16" strokeWidth="2.5" />
        <path d="M50 30 l6 8 -6 8 -6 -8 z" fill="#2fb3a3" stroke="#0f5f58" strokeWidth="2" />
      </svg>
    );
  }
  if (kind === 'chef') {
    return (
      <svg viewBox="0 0 100 70" className="hl-acc hl-acc-chef" aria-hidden="true">
        <path d="M22 44 C6 42 6 18 24 20 C26 4 50 0 54 16 C62 2 90 8 80 28 C96 30 94 50 78 46 Z" fill="#fff" stroke="#c9d2d0" strokeWidth="3" strokeLinejoin="round" />
        <rect x="24" y="42" width="54" height="18" rx="5" fill="#fff" stroke="#c9d2d0" strokeWidth="3" />
        <path d="M38 44 v14 M51 44 v14 M64 44 v14" stroke="#dfe5e4" strokeWidth="2.5" />
      </svg>
    );
  }
  if (kind === 'cap') {
    return (
      <svg viewBox="0 0 100 64" className="hl-acc hl-acc-cap" aria-hidden="true">
        <path d="M50 6 L96 24 L50 42 L4 24 Z" fill="#26323a" stroke="#141b20" strokeWidth="3" strokeLinejoin="round" />
        <path d="M26 33 v14 c0 8 48 8 48 0 v-14 L50 42 Z" fill="#34424c" stroke="#141b20" strokeWidth="3" strokeLinejoin="round" />
        <path d="M86 28 v18" stroke="#f6c453" strokeWidth="3" strokeLinecap="round" />
        <circle cx="86" cy="50" r="5" fill="#f6c453" />
      </svg>
    );
  }
  if (kind === 'headband') {
    return (
      <svg viewBox="0 0 100 30" className="hl-acc hl-acc-headband" aria-hidden="true">
        <path d="M4 18 C30 4 70 4 96 18 L96 28 C70 14 30 14 4 28 Z" fill="#ef6f5e" stroke="#b9473a" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M30 12 c6-2 14-3 20-3" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
      </svg>
    );
  }
  if (kind === 'party') {
    return (
      <svg viewBox="0 0 70 80" className="hl-acc hl-acc-party" aria-hidden="true">
        <path d="M35 4 L62 74 L8 74 Z" fill="#7cc8f0" stroke="#3b8db8" strokeWidth="3" strokeLinejoin="round" />
        <path d="M22 40 L48 40 M15 58 L55 58" stroke="#f6c453" strokeWidth="5" />
        <circle cx="35" cy="5" r="6" fill="#ef6f5e" />
      </svg>
    );
  }
  return null;
}

/** Hailey's animated face: a soft orb with eyes that blink, look around, and react to voice. */
export function Avatar({ state = 'idle', size = 120, accessory = 'none' }: { state?: 'idle' | 'listening' | 'thinking' | 'speaking' | 'happy'; size?: number; accessory?: Accessory }) {
  return (
    <div className={`hl-avatar hl-avatar-${state}`} style={{ width: size, height: size }} aria-hidden="true">
      <div className="hl-avatar-glow" />
      <div className="hl-avatar-face">
        <span className="hl-avatar-eye" />
        <span className="hl-avatar-eye" />
        <span className="hl-avatar-mouth" />
      </div>
      <AccessoryArt kind={accessory} />
    </div>
  );
}
