const hostnamePattern = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)+(?::\d{1,5})?(?:[/?#].*)?$/i;
const localhostPattern = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d{1,5})?(?:[/?#].*)?$/i;

export function toNavigationUrl(value: string, searchEngine: import("../../shared/browser").SearchEngine = "duckduckgo"): string | undefined {
  const candidate = value.trim();
  if (!candidate) return undefined;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // A hostname without a protocol is handled below; other input becomes a search.
  }

  if (!/\s/.test(candidate) && hostnamePattern.test(candidate)) {
    return `https://${candidate}`;
  }

  if (!/\s/.test(candidate) && localhostPattern.test(candidate)) {
    return `http://${candidate}`;
  }

  const encoded = encodeURIComponent(candidate);
  switch (searchEngine) {
    case "google": return `https://www.google.com/search?q=${encoded}`;
    case "bing": return `https://www.bing.com/search?q=${encoded}`;
    case "duckduckgo":
    default:
      return `https://duckduckgo.com/?q=${encoded}`;
  }
}

export function addressLabel(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" && !parsed.search && !parsed.hash ? parsed.host : url;
  } catch {
    return url;
  }
}
