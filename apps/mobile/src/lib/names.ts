/** "Nora" from "Nora Lind", "Ines" from "Ines, the sitter": what to call someone in a sentence. Empty when there is no name. */
export function firstName(displayName: string | null | undefined): string {
  return (displayName?.trim().split(/\s+/)[0] ?? '').replace(/[,;:]+$/, '');
}

/** Up to two initials for the picture placeholder: "Nora Lind" gives "NL". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}
