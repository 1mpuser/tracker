// Crafted inline SVG glyphs — replace system emoji so everything stays on-palette
// (colour is driven by CSS `currentColor` / `fill`, not a fixed emoji hue).

interface IconProps {
  className?: string;
}

export function FlameIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 30" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 1c.5 4.6 5.2 6.3 6 11.6.9 5.6-2.6 10.4-6 10.4S5.4 19 5.4 14c0-2.9 1.6-4.6 2.8-6.6.3 2 1.6 3.1 2.6 3.1 1.3 0 1.5-1.8 1.2-3.4C11.6 4.9 11.9 3.5 12 1Z"
      />
    </svg>
  );
}

export function TomatoIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        d="M12 8.2c4 0 6.8 2.8 6.8 6.4S15.6 21.4 12 21.4 5.2 18.6 5.2 14.6 8 8.2 12 8.2Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        d="M12 8.2V6M12 6c-.9-1.4-2.4-1.7-3.6-1.5.3 1.3 1.4 2.2 2.7 2.2M12 6c.9-1.4 2.4-1.7 3.6-1.5-.3 1.3-1.4 2.2-2.7 2.2"
      />
    </svg>
  );
}

export function GearIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeWidth="1.6" d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        d="M12 2.6l1.5 2.2 2.6-.5.6 2.6 2.4 1.1-.9 2.5 1.6 2.1-2 1.8.2 2.7-2.6.4-1.2 2.4L12 20.4l-2.2 1.3-1.2-2.4-2.6-.4.2-2.7-2-1.8 1.6-2.1-.9-2.5 2.4-1.1.6-2.6 2.6.5L12 2.6Z"
      />
    </svg>
  );
}
