import { app, net, protocol } from "electron";
import { join } from "path";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";

const CACHE_FILE = join(app.getPath("userData"), "favicons.json");
const MAX_FAVICONS = 5000;

interface CacheEntry {
  dataUrl: string;
  lastUsed: number;
}

let cache = new Map<string, CacheEntry>();
let saveTimeout: NodeJS.Timeout | null = null;

export async function initFaviconCache() {
  if (existsSync(CACHE_FILE)) {
    try {
      const data = await readFile(CACHE_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (typeof parsed === "object" && parsed !== null) {
        cache = new Map(Object.entries(parsed));
      }
    } catch (e) {
      console.error("Failed to load favicon cache", e);
    }
  }

  protocol.handle("lily-favicon", (request) => {
    try {
      const url = new URL(request.url);
      const hostname = url.hostname;
      const entry = cache.get(hostname);
      if (entry && entry.dataUrl) {
        entry.lastUsed = Date.now();
        scheduleSave();
        
        const match = entry.dataUrl.match(/^data:(.*?);base64,(.*)$/);
        if (match) {
          const mime = match[1];
          const buffer = Buffer.from(match[2], "base64");
          return new Response(buffer, { 
            headers: { 
              "Content-Type": mime, 
              "Cache-Control": "public, max-age=86400" 
            } 
          });
        }
      }
      return new Response(null, { status: 404 });
    } catch {
      return new Response(null, { status: 400 });
    }
  });
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveCache().catch(e => console.error("Failed to save favicon cache", e));
  }, 5000);
}

async function saveCache() {
  if (cache.size > MAX_FAVICONS) {
    const sorted = Array.from(cache.entries()).sort((a, b) => b[1].lastUsed - a[1].lastUsed);
    cache = new Map(sorted.slice(0, MAX_FAVICONS));
  }
  
  try {
    const obj = Object.fromEntries(cache.entries());
    await writeFile(CACHE_FILE, JSON.stringify(obj));
  } catch (e) {
    console.error("Failed to save favicon cache", e);
  }
}

export async function fetchAndCacheFavicon(hostname: string, faviconUrl: string) {
  if (!hostname || !faviconUrl) return;
  if (cache.has(hostname)) return; // Already cached
  
  if (faviconUrl.startsWith("data:")) {
    cache.set(hostname, { dataUrl: faviconUrl, lastUsed: Date.now() });
    scheduleSave();
    return;
  }

  try {
    const res = await net.fetch(faviconUrl);
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      // Enforce max size (e.g. 500KB) to prevent huge images from bloating cache
      if (buffer.byteLength > 500 * 1024) return;
      
      const b64 = Buffer.from(buffer).toString('base64');
      const mime = res.headers.get("content-type") || "image/png";
      const dataUrl = `data:${mime};base64,${b64}`;
      
      cache.set(hostname, { dataUrl, lastUsed: Date.now() });
      scheduleSave();
    }
  } catch {
    // Ignore gracefully
  }
}
