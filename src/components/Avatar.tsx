/** Hailey's animated face: a soft orb with eyes that blink, look around, and react to voice. */
export function Avatar({ state = 'idle', size = 120 }: { state?: 'idle' | 'listening' | 'thinking' | 'speaking'; size?: number }) {
  return (
    <div className={`hl-avatar hl-avatar-${state}`} style={{ width: size, height: size }} aria-hidden="true">
      <div className="hl-avatar-glow" />
      <div className="hl-avatar-face">
        <span className="hl-avatar-eye" />
        <span className="hl-avatar-eye" />
        <span className="hl-avatar-mouth" />
      </div>
    </div>
  );
}
