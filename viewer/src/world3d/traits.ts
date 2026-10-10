/** Pulls the personality words out of a person's own description. */

export function parseTraits(voice: string | null): string[] {
  if (!voice) return [];
  const match = /^You are [^,]+, \d+ years old, (.+?)\. You /.exec(voice);
  if (!match?.[1]) return [];
  return match[1]
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
