import type { Bookmark, BookmarkFolder } from "../shared/browser";

export interface ImportedBookmark {
  url: string;
  title: string;
  createdAt?: number;
  folderName?: string;
}

export function parseBookmarkHtml(html: string): ImportedBookmark[] {
  const bookmarks: ImportedBookmark[] = [];
  const folderStack: string[] = [];

  // Match:
  // <DT><H3 ...>FolderName</H3>
  // <DL> or <DL><p>
  // </DL> or </DL><p>
  // <DT><A ... HREF="url" ...>Title</A>
  // We need to parse these tags in order.
  
  // Regex matches H3, DL, /DL, and A tags.
  // Note: HTML tags are case-insensitive.
  const tagRegex = /<(h3|dl|\/dl|a)(?:[^>]+)?>/gi;
  
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    const tagContent = match[0];
    
    if (tagName === "h3") {
      // Find the closing </H3>
      const closeH3 = html.toLowerCase().indexOf("</h3>", tagRegex.lastIndex);
      
      let title = "New Folder";
      if (closeH3 !== -1) {
        title = html.substring(tagRegex.lastIndex, closeH3).trim();
      }
      folderStack.push(title);
    } else if (tagName === "/dl") {
      if (folderStack.length > 0) {
        folderStack.pop();
      }
    } else if (tagName === "a") {
      // Extract HREF and ADD_DATE
      const hrefMatch = /href\s*=\s*"([^"]+)"/i.exec(tagContent);
      const dateMatch = /add_date\s*=\s*"(\d+)"/i.exec(tagContent);
      
      const closeA = html.toLowerCase().indexOf("</a>", tagRegex.lastIndex);
      let title = "Bookmark";
      if (closeA !== -1) {
        title = html.substring(tagRegex.lastIndex, closeA).trim();
      }

      if (hrefMatch) {
        const url = hrefMatch[1];
        let createdAt: number | undefined;
        if (dateMatch) {
          const parsed = parseInt(dateMatch[1], 10);
          if (!isNaN(parsed) && parsed > 0) {
            // Netscape bookmarks store time in seconds since epoch, JS uses milliseconds
            createdAt = parsed * 1000;
          }
        }
        bookmarks.push({
          url,
          title,
          createdAt,
          folderName: folderStack.length > 0 ? folderStack[folderStack.length - 1] : undefined
        });
      }
    }
  }

  return bookmarks;
}

export function generateBookmarkHtml(bookmarks: Bookmark[], folders: BookmarkFolder[]): string {
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks Menu</H1>
<DL><p>
`;

  // Root bookmarks
  const rootBookmarks = bookmarks.filter(b => !b.folderId);
  for (const b of rootBookmarks) {
    const addDate = Math.floor(b.createdAt / 1000);
    html += `    <DT><A HREF="${b.url}" ADD_DATE="${addDate}">${escapeHtml(b.title)}</A>\n`;
  }

  // Folders and their bookmarks
  for (const folder of folders) {
    const folderBookmarks = bookmarks.filter(b => b.folderId === folder.id);
    if (folderBookmarks.length > 0) {
      const folderAddDate = Math.floor(folder.createdAt / 1000);
      html += `    <DT><H3 ADD_DATE="${folderAddDate}">${escapeHtml(folder.name)}</H3>\n    <DL><p>\n`;
      for (const b of folderBookmarks) {
        const addDate = Math.floor(b.createdAt / 1000);
        html += `        <DT><A HREF="${b.url}" ADD_DATE="${addDate}">${escapeHtml(b.title)}</A>\n`;
      }
      html += `    </DL><p>\n`;
    }
  }

  html += `</DL><p>\n`;
  return html;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
