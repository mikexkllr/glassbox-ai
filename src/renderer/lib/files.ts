const cache = new Map<string, Promise<string>>()

/** Fetch (and cache) a file's content at a ref via the main process. */
export function getFileText(repoPath: string, ref: string, file: string): Promise<string> {
  const key = `${repoPath}::${ref}::${file}`
  if (!cache.has(key)) cache.set(key, window.glassbox.readFileContent(repoPath, ref, file))
  return cache.get(key)!
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
