interface IconProps {
  // Font Awesome classes, e.g. "fa-solid fa-camera".
  name: string;
}

// Decorative: the text next to it, or the aria-label of its control, carries the meaning.
export function Icon({ name }: IconProps) {
  return <i className={name} aria-hidden="true" />;
}
