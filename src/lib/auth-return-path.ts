export function safeReturnPath(value: string | null): string {
  const fallback = '/dashboard'
  if (!value?.startsWith('/') || value.startsWith('//') || /%25/i.test(value)) return fallback
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value + decoded)) return fallback
    const url = new URL(value, 'https://stackpulse.invalid')
    if (url.origin !== 'https://stackpulse.invalid' || url.pathname.startsWith('//'))
      return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}
