export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function stableHash(value: unknown): string {
  const input = canonicalJson(value);
  let first = 2166136261;
  let second = 2246822519;
  let third = 3266489917;
  let fourth = 668265263;
  for (const character of input) {
    const code = character.codePointAt(0) ?? 0;
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
    third = Math.imul(third ^ code, 2246822519);
    fourth = Math.imul(fourth ^ code, 374761393);
  }
  const parts = [first, second, third, fourth].map((part) => (part >>> 0).toString(16).padStart(8, '0'));
  return `${parts.join('')}${parts.reverse().join('')}`;
}
