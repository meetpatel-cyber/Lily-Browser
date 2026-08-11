import * as React from "react";
import type { Bookmark, BookmarkFolder, DownloadRecord, HistoryEntry } from "../../shared/browser";
import { Icon } from "./Icon";
import { useState } from "react";

function BookmarkFavicon({ url }: { url: string }) {
  const [error, setError] = useState(false);
  if (error) return <Icon name="star" size={16} filled />;
  try {
    const hostname = new URL(url).hostname;
    return <img src={`lily-favicon://${hostname}`} width={16} height={16} onError={() => setError(true)} style={{ objectFit: 'contain' }} alt="" />;
  } catch {
    return <Icon name="star" size={16} filled />;
  }
}

export type LibrarySection = "bookmarks" | "history" | "downloads";

interface LibraryPanelProps {
  section: LibrarySection;
  bookmarks: Bookmark[];
  bookmarkFolders: BookmarkFolder[];
  history: HistoryEntry[];
  downloads: DownloadRecord[];
  onSectionChange: (section: LibrarySection) => void;
  onClose: () => void;
  onOpenUrl: (url: string) => void;
  onRemoveBookmark: (bookmarkId: string) => void;
  onUpdateBookmark: (bookmarkId: string, url: string, title: string, folderId?: string) => void;
  onCreateBookmarkFolder: (name: string) => void;
  onRenameBookmarkFolder: (folderId: string, name: string) => void;
  onDeleteBookmarkFolder: (folderId: string) => void;
  onRemoveHistory: (historyId: string) => void;
  onClearHistory: () => void;
  onOpenDownload: (downloadId: string) => void;
  onRevealDownload: (downloadId: string) => void;
  onPauseDownload: (downloadId: string) => void;
  onResumeDownload: (downloadId: string) => void;
  onCancelDownload: (downloadId: string) => void;
  onRemoveDownload: (downloadId: string) => void;
  onRetryDownload: (downloadId: string) => void;
  onClearCompletedDownloads: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1_024;
    unit += 1;
  } while (value >= 1_024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="library-empty">{children}</p>;
}

function BookmarkList({ bookmarks, bookmarkFolders, onOpenUrl, onRemoveBookmark, onUpdateBookmark, onCreateBookmarkFolder, onRenameBookmarkFolder, onDeleteBookmarkFolder }: Pick<LibraryPanelProps, "bookmarks" | "bookmarkFolders" | "onOpenUrl" | "onRemoveBookmark" | "onUpdateBookmark" | "onCreateBookmarkFolder" | "onRenameBookmarkFolder" | "onDeleteBookmarkFolder">) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editUrl, setEditUrl] = React.useState("");
  const [editFolderId, setEditFolderId] = React.useState<string | undefined>(undefined);
  
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set());
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");
  
  const [renamingFolderId, setRenamingFolderId] = React.useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = React.useState("");

  if (bookmarks.length === 0 && bookmarkFolders.length === 0 && !isCreatingFolder) return <EmptyState>Pages you save will appear here.</EmptyState>;

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  
  const filteredBookmarks = isSearching
    ? bookmarks.filter((b) => b.title.toLowerCase().includes(query) || b.url.toLowerCase().includes(query))
    : bookmarks;

  const handleEditClick = (bookmark: Bookmark) => {
    setEditingId(bookmark.id);
    setEditTitle(bookmark.title);
    setEditUrl(bookmark.url);
    setEditFolderId(bookmark.folderId);
  };

  const handleSave = () => {
    if (editingId && editUrl.trim() !== "") {
      onUpdateBookmark(editingId, editUrl.trim(), editTitle.trim() || editUrl.trim(), editFolderId);
      setEditingId(null);
    }
  };

  const toggleFolder = (folderId: string) => {
    const next = new Set(expandedFolders);
    if (next.has(folderId)) next.delete(folderId);
    else next.add(folderId);
    setExpandedFolders(next);
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim() !== "") {
      onCreateBookmarkFolder(newFolderName.trim());
    }
    setIsCreatingFolder(false);
    setNewFolderName("");
  };

  const handleRenameFolder = () => {
    if (renamingFolderId && renameFolderName.trim() !== "") {
      onRenameBookmarkFolder(renamingFolderId, renameFolderName.trim());
    }
    setRenamingFolderId(null);
  };

  return (
    <div className="library-bookmarks-container" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="history-search">
        <span className="history-search__icon"><Icon name="search" size={14} /></span>
        <input
          type="text"
          className="history-search__input"
          placeholder="Search bookmarks"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button type="button" className="history-search__clear" onClick={() => setSearchQuery("")} title="Clear search" aria-label="Clear search">
            <Icon name="close" size={15} />
          </button>
        )}
      </div>

      {!isSearching && (
        <div style={{ padding: "0 16px 8px" }}>
          {!isCreatingFolder ? (
            <button type="button" onClick={() => setIsCreatingFolder(true)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px", padding: 0 }}>
              <Icon name="plus" size={14} /> New Folder
            </button>
          ) : (
            <div style={{ display: "flex", gap: "6px" }}>
              <input type="text" className="history-search__input" style={{ flex: 1, margin: 0, height: "24px" }} placeholder="Folder name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setIsCreatingFolder(false); }} />
              <button type="button" onClick={handleCreateFolder} style={{ padding: "4px 8px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Create</button>
              <button type="button" onClick={() => setIsCreatingFolder(false)} style={{ padding: "4px 8px", background: "var(--bg-active)", color: "inherit", border: "none", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {isSearching && filteredBookmarks.length === 0 ? (
        <EmptyState>No bookmarks found.</EmptyState>
      ) : (
        <div className="library-list">
          {/* Render search results as flat list */}
          {isSearching && filteredBookmarks.map((bookmark) => (
            <div className="library-entry" key={bookmark.id}>
              {editingId === bookmark.id ? (
                <div className="bookmark-edit-form" style={{ display: "flex", flexDirection: "column", flex: 1, gap: "6px", minWidth: 0, padding: "4px 0" }}>
                  <input type="text" className="history-search__input" style={{ height: "26px", padding: "0 8px", marginBottom: 0 }} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Name" />
                  <input type="text" className="history-search__input" style={{ height: "26px", padding: "0 8px", marginBottom: 0, color: "#888b92" }} value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="URL" />
                  {bookmarkFolders.length > 0 && (
                    <select className="history-search__input" style={{ height: "26px", padding: "0 4px", marginBottom: 0 }} value={editFolderId || ""} onChange={(e) => setEditFolderId(e.target.value || undefined)}>
                      <option value="">Root</option>
                      {bookmarkFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  )}
                  <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                    <button type="button" onClick={handleSave} style={{ padding: "4px 10px", borderRadius: "6px", background: "var(--accent)", color: "#fff", border: "0", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Save</button>
                    <button type="button" onClick={() => setEditingId(null)} style={{ padding: "4px 10px", borderRadius: "6px", background: "var(--bg-active)", color: "inherit", border: "0", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <button className="library-entry__open" type="button" onClick={() => onOpenUrl(bookmark.url)} title={bookmark.url}>
                    <BookmarkFavicon url={bookmark.url} />
                    <span><strong>{bookmark.title}</strong><small>{bookmark.url}</small></span>
                  </button>
                  <button className="library-entry__action" type="button" title="Edit bookmark" onClick={() => handleEditClick(bookmark)}><Icon name="edit" size={15} /></button>
                  <button className="library-entry__action" type="button" title="Delete bookmark" onClick={() => onRemoveBookmark(bookmark.id)}><Icon name="trash" size={16} /></button>
                </>
              )}
            </div>
          ))}

          {/* Render hierarchical view when not searching */}
          {!isSearching && (
            <>
              {/* Folders first */}
              {bookmarkFolders.map(folder => {
                const isExpanded = expandedFolders.has(folder.id);
                const folderBookmarks = bookmarks.filter(b => b.folderId === folder.id);
                const isRenaming = renamingFolderId === folder.id;

                return (
                  <div key={folder.id} style={{ display: "flex", flexDirection: "column" }}>
                    <div className="library-entry" style={{ background: isExpanded ? "var(--bg-active)" : "transparent" }}>
                      {isRenaming ? (
                        <div style={{ display: "flex", gap: "6px", flex: 1, padding: "4px 0" }}>
                          <input type="text" className="history-search__input" style={{ flex: 1, margin: 0, height: "24px" }} value={renameFolderName} onChange={(e) => setRenameFolderName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleRenameFolder(); if (e.key === 'Escape') setRenamingFolderId(null); }} />
                          <button type="button" onClick={handleRenameFolder} style={{ padding: "4px 8px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Save</button>
                          <button type="button" onClick={() => setRenamingFolderId(null)} style={{ padding: "4px 8px", background: "var(--bg-active)", color: "inherit", border: "none", borderRadius: "4px", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <button className="library-entry__open" type="button" onClick={() => toggleFolder(folder.id)}>
                            <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={14} />
                            <Icon name="folder" size={16} />
                            <span><strong>{folder.name}</strong><small>{folderBookmarks.length} item{folderBookmarks.length !== 1 ? 's' : ''}</small></span>
                          </button>
                          <button className="library-entry__action" type="button" title="Rename folder" onClick={() => { setRenamingFolderId(folder.id); setRenameFolderName(folder.name); }}><Icon name="edit" size={15} /></button>
                          <button className="library-entry__action" type="button" title="Delete folder" disabled={folderBookmarks.length > 0} style={{ opacity: folderBookmarks.length > 0 ? 0.3 : 1, cursor: folderBookmarks.length > 0 ? "not-allowed" : "pointer" }} onClick={() => onDeleteBookmarkFolder(folder.id)}><Icon name="trash" size={16} /></button>
                        </>
                      )}
                    </div>
                    {isExpanded && folderBookmarks.length > 0 && (
                      <div style={{ paddingLeft: "24px" }}>
                        {folderBookmarks.map(bookmark => (
                          <div className="library-entry" key={bookmark.id}>
                            {editingId === bookmark.id ? (
                              <div className="bookmark-edit-form" style={{ display: "flex", flexDirection: "column", flex: 1, gap: "6px", minWidth: 0, padding: "4px 0" }}>
                                <input type="text" className="history-search__input" style={{ height: "26px", padding: "0 8px", marginBottom: 0 }} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Name" />
                                <input type="text" className="history-search__input" style={{ height: "26px", padding: "0 8px", marginBottom: 0, color: "#888b92" }} value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="URL" />
                                {bookmarkFolders.length > 0 && (
                                  <select className="history-search__input" style={{ height: "26px", padding: "0 4px", marginBottom: 0 }} value={editFolderId || ""} onChange={(e) => setEditFolderId(e.target.value || undefined)}>
                                    <option value="">Root</option>
                                    {bookmarkFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                  </select>
                                )}
                                <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                                  <button type="button" onClick={handleSave} style={{ padding: "4px 10px", borderRadius: "6px", background: "var(--accent)", color: "#fff", border: "0", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Save</button>
                                  <button type="button" onClick={() => setEditingId(null)} style={{ padding: "4px 10px", borderRadius: "6px", background: "var(--bg-active)", color: "inherit", border: "0", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <button className="library-entry__open" type="button" onClick={() => onOpenUrl(bookmark.url)} title={bookmark.url}>
                                  <BookmarkFavicon url={bookmark.url} />
                                  <span><strong>{bookmark.title}</strong><small>{bookmark.url}</small></span>
                                </button>
                                <button className="library-entry__action" type="button" title="Edit bookmark" onClick={() => handleEditClick(bookmark)}><Icon name="edit" size={15} /></button>
                                <button className="library-entry__action" type="button" title="Delete bookmark" onClick={() => onRemoveBookmark(bookmark.id)}><Icon name="trash" size={16} /></button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Root bookmarks */}
              {bookmarks.filter(b => !b.folderId).map((bookmark) => (
                <div className="library-entry" key={bookmark.id}>
                  {editingId === bookmark.id ? (
                    <div className="bookmark-edit-form" style={{ display: "flex", flexDirection: "column", flex: 1, gap: "6px", minWidth: 0, padding: "4px 0" }}>
                      <input type="text" className="history-search__input" style={{ height: "26px", padding: "0 8px", marginBottom: 0 }} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Name" />
                      <input type="text" className="history-search__input" style={{ height: "26px", padding: "0 8px", marginBottom: 0, color: "#888b92" }} value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="URL" />
                      {bookmarkFolders.length > 0 && (
                        <select className="history-search__input" style={{ height: "26px", padding: "0 4px", marginBottom: 0 }} value={editFolderId || ""} onChange={(e) => setEditFolderId(e.target.value || undefined)}>
                          <option value="">Root</option>
                          {bookmarkFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      )}
                      <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                        <button type="button" onClick={handleSave} style={{ padding: "4px 10px", borderRadius: "6px", background: "var(--accent)", color: "#fff", border: "0", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Save</button>
                        <button type="button" onClick={() => setEditingId(null)} style={{ padding: "4px 10px", borderRadius: "6px", background: "var(--bg-active)", color: "inherit", border: "0", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button className="library-entry__open" type="button" onClick={() => onOpenUrl(bookmark.url)} title={bookmark.url}>
                        <BookmarkFavicon url={bookmark.url} />
                        <span><strong>{bookmark.title}</strong><small>{bookmark.url}</small></span>
                      </button>
                      <button className="library-entry__action" type="button" title="Edit bookmark" onClick={() => handleEditClick(bookmark)}><Icon name="edit" size={15} /></button>
                      <button className="library-entry__action" type="button" title="Delete bookmark" onClick={() => onRemoveBookmark(bookmark.id)}><Icon name="trash" size={16} /></button>
                    </>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const timeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

function HistoryList({ history, onOpenUrl, onRemoveHistory }: Pick<LibraryPanelProps, "history" | "onOpenUrl" | "onRemoveHistory">) {
  const [searchQuery, setSearchQuery] = React.useState("");

  if (history.length === 0) return <EmptyState>Pages you visit will appear here.</EmptyState>;

  const query = searchQuery.trim().toLowerCase();
  const filteredHistory = query
    ? history.filter(
        (entry) =>
          entry.title.toLowerCase().includes(query) ||
          entry.url.toLowerCase().includes(query)
      )
    : history;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();

  const groups: { label: string; entries: HistoryEntry[]; showTime: boolean }[] = [];

  for (const entry of filteredHistory) {
    const d = new Date(entry.visitedAt);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

    let label = "";
    let showTime = false;

    if (dayStart === todayStart) {
      label = "Today";
      showTime = true;
    } else if (dayStart === yesterdayStart) {
      label = "Yesterday";
      showTime = true;
    } else {
      label = dateFormatter.format(d);
    }

    let group = groups[groups.length - 1];
    if (!group || group.label !== label) {
      group = { label, entries: [], showTime };
      groups.push(group);
    }

    group.entries.push(entry);
  }

  return (
    <div className="library-history-container" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="history-search">
        <span className="history-search__icon"><Icon name="search" size={14} /></span>
        <input
          type="text"
          className="history-search__input"
          placeholder="Search history"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="history-search__clear"
            title="Clear search"
            aria-label="Clear search"
            onClick={() => setSearchQuery("")}
          >
            <Icon name="close" size={15} />
          </button>
        )}
      </div>

      {filteredHistory.length === 0 ? (
        <EmptyState>No history found.</EmptyState>
      ) : (
        <div className="library-history-groups" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {groups.map((group) => (
            <div className="library-group" key={group.label}>
              <h4 style={{ margin: "0 0 10px 4px", fontSize: "13px", fontWeight: 650, color: "#777a81" }}>{group.label}</h4>
              <div className="library-list">
                {group.entries.map((entry) => (
                  <div className="library-entry" key={entry.id}>
                    <button className="library-entry__open" type="button" onClick={() => onOpenUrl(entry.url)} title={entry.url}>
                      <Icon name="history" size={16} />
                      <span><strong>{entry.title}</strong><small>{entry.url}</small></span>
                    </button>
                    {group.showTime && (
                      <time className="library-entry__time" dateTime={new Date(entry.visitedAt).toISOString()}>
                        {timeFormatter.format(entry.visitedAt)}
                      </time>
                    )}
                    <button className="library-entry__action" type="button" title="Remove from history" aria-label="Remove from history" onClick={() => onRemoveHistory(entry.id)}>
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function downloadStatus(download: DownloadRecord): string {
  if (download.status === "completed") return `${formatBytes(download.receivedBytes)} · Complete`;
  if (download.status === "cancelled") return "Cancelled";
  if (download.status === "failed") return "Failed";

  if (download.isPaused) {
    if (download.totalBytes > 0) return `Paused · ${formatBytes(download.receivedBytes)} of ${formatBytes(download.totalBytes)}`;
    return `Paused · ${formatBytes(download.receivedBytes)}`;
  }

  const parts: string[] = [];
  if (download.totalBytes > 0) {
    const pct = Math.min(100, Math.floor((download.receivedBytes / download.totalBytes) * 100));
    parts.push(`${pct}%`);
    parts.push(`${formatBytes(download.receivedBytes)} of ${formatBytes(download.totalBytes)}`);
  } else {
    parts.push(`${formatBytes(download.receivedBytes)} downloaded`);
  }

  if (download.speed) {
    parts.push(download.speed);
  }

  return parts.join(" · ");
}

function DownloadList({ downloads, onOpenDownload, onRevealDownload, onPauseDownload, onResumeDownload, onCancelDownload, onRemoveDownload, onRetryDownload }: Pick<LibraryPanelProps, "downloads" | "onOpenDownload" | "onRevealDownload" | "onPauseDownload" | "onResumeDownload" | "onCancelDownload" | "onRemoveDownload" | "onRetryDownload">) {
  const [searchQuery, setSearchQuery] = React.useState("");

  if (downloads.length === 0) return <EmptyState>Downloads started from websites will appear here.</EmptyState>;

  const query = searchQuery.trim().toLowerCase();
  const filteredDownloads = query
    ? downloads.filter(
        (d) =>
          d.filename.toLowerCase().includes(query) ||
          d.url.toLowerCase().includes(query)
      )
    : downloads;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();

  const groups: { label: string; entries: DownloadRecord[]; showTime: boolean }[] = [];

  for (const download of filteredDownloads) {
    const d = new Date(download.startedAt);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

    let label = "";
    let showTime = false;

    if (dayStart === todayStart) {
      label = "Today";
      showTime = true;
    } else if (dayStart === yesterdayStart) {
      label = "Yesterday";
      showTime = true;
    } else {
      label = dateFormatter.format(d);
    }

    let group = groups[groups.length - 1];
    if (!group || group.label !== label) {
      group = { label, entries: [], showTime };
      groups.push(group);
    }

    group.entries.push(download);
  }

  return (
    <div className="library-downloads-container" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="history-search">
        <span className="history-search__icon"><Icon name="search" size={14} /></span>
        <input
          type="text"
          className="history-search__input"
          placeholder="Search downloads"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button type="button" className="history-search__clear" onClick={() => setSearchQuery("")} title="Clear search" aria-label="Clear search">
            <Icon name="close" size={15} />
          </button>
        )}
      </div>

      {filteredDownloads.length === 0 ? (
        <EmptyState>No downloads found.</EmptyState>
      ) : (
        <div className="library-downloads-groups" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {groups.map((group) => (
            <div className="library-group" key={group.label}>
              <h4 style={{ margin: "0 0 10px 4px", fontSize: "13px", fontWeight: 650, color: "#777a81" }}>{group.label}</h4>
              <div className="library-list">
                {group.entries.map((download) => (
                  <div className="library-entry library-entry--download" key={download.id}>
                    <span className={`download-icon download-icon--${download.status}`}><Icon name="download" size={17} /></span>
                    <span className="library-entry__download-copy">
                      <strong title={download.filename}>{download.filename}</strong>
                      <small>{downloadStatus(download)}</small>
                      {download.error && <em>{download.error}</em>}
                    </span>
                    {download.status === "in-progress" && <span className={`download-progress ${download.totalBytes > 0 ? "" : "download-progress--indeterminate"} ${download.isPaused ? "download-progress--paused" : ""}`} aria-label="Download in progress"><i style={download.totalBytes > 0 ? { width: `${Math.min(100, Math.max(0, (download.receivedBytes / download.totalBytes) * 100))}%` } : undefined} /></span>}
                    {download.status === "in-progress" && (
                      <span className="download-actions">
                        {download.isPaused ? (
                          download.canResume && (
                            <button className="library-entry__action" type="button" title="Resume download" aria-label={`Resume download ${download.filename}`} onClick={() => onResumeDownload(download.id)}>
                              <Icon name="play" size={15} />
                            </button>
                          )
                        ) : (
                          <button className="library-entry__action" type="button" title="Pause download" aria-label={`Pause download ${download.filename}`} onClick={() => onPauseDownload(download.id)}>
                            <Icon name="pause" size={15} />
                          </button>
                        )}
                        <button className="library-entry__action" type="button" title="Cancel download" aria-label={`Cancel download ${download.filename}`} onClick={() => onCancelDownload(download.id)}>
                          <Icon name="close" size={15} />
                        </button>
                      </span>
                    )}
                    {download.status !== "in-progress" && <span className="download-actions">
                      {download.status === "failed" && (
                        <button className="library-entry__action" type="button" title="Retry download" aria-label={`Retry ${download.filename}`} onClick={() => onRetryDownload(download.id)}>
                          <Icon name="reload" size={15} />
                        </button>
                      )}
                      {download.status === "completed" && (
                        <>
                          <button className="library-entry__action" type="button" title="Open downloaded file" aria-label={`Open ${download.filename}`} onClick={() => onOpenDownload(download.id)}><Icon name="open" size={16} /></button>
                          <button className="library-entry__action" type="button" title="Show in folder" aria-label={`Show ${download.filename} in folder`} onClick={() => onRevealDownload(download.id)}><Icon name="folder" size={16} /></button>
                        </>
                      )}
                      <button className="library-entry__action" type="button" title="Remove from list" aria-label={`Remove ${download.filename} from list`} onClick={() => onRemoveDownload(download.id)}>
                        <Icon name="close" size={15} />
                      </button>
                    </span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LibraryPanel({ section, bookmarks, bookmarkFolders, history, downloads, onSectionChange, onClose, onOpenUrl, onRemoveBookmark, onUpdateBookmark, onCreateBookmarkFolder, onRenameBookmarkFolder, onDeleteBookmarkFolder, onRemoveHistory, onClearHistory, onOpenDownload, onRevealDownload, onPauseDownload, onResumeDownload, onCancelDownload, onRemoveDownload, onRetryDownload, onClearCompletedDownloads }: LibraryPanelProps) {
  const hasCompletedDownloads = downloads.some(d => d.status === "completed");

  return (
    <section className="library-panel" aria-label="Library">
      <div className="library-panel__header">
        <div><span className="library-panel__eyebrow">Lily Browser</span><h2>Library</h2></div>
        <button className="library-close" type="button" aria-label="Close library" title="Close library" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="library-tabs" role="tablist" aria-label="Library sections">
        {(["bookmarks", "history", "downloads"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={section === item} className={section === item ? "library-tab library-tab--active" : "library-tab"} onClick={() => onSectionChange(item)}>{item}</button>)}
      </div>
      <div className="library-panel__content">
        <div className="library-panel__section-heading">
          <h3>{section === "bookmarks" ? "Bookmarks" : section === "history" ? "History" : "Downloads"}</h3>
          {section === "bookmarks" && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="library-clear" type="button" onClick={() => window.lilyBrowser.importBookmarks()}>Import</button>
              <button className="library-clear" type="button" onClick={() => window.lilyBrowser.exportBookmarks()}>Export</button>
            </div>
          )}
          {section === "history" && history.length > 0 && <button className="library-clear" type="button" onClick={onClearHistory}>Clear history</button>}
          {section === "downloads" && hasCompletedDownloads && <button className="library-clear" type="button" onClick={onClearCompletedDownloads}>Clear completed</button>}
        </div>
        {section === "bookmarks" && <BookmarkList bookmarks={bookmarks} bookmarkFolders={bookmarkFolders} onOpenUrl={onOpenUrl} onRemoveBookmark={onRemoveBookmark} onUpdateBookmark={onUpdateBookmark} onCreateBookmarkFolder={onCreateBookmarkFolder} onRenameBookmarkFolder={onRenameBookmarkFolder} onDeleteBookmarkFolder={onDeleteBookmarkFolder} />}
        {section === "history" && <HistoryList history={history} onOpenUrl={onOpenUrl} onRemoveHistory={onRemoveHistory} />}
        {section === "downloads" && <DownloadList downloads={downloads} onOpenDownload={onOpenDownload} onRevealDownload={onRevealDownload} onPauseDownload={onPauseDownload} onResumeDownload={onResumeDownload} onCancelDownload={onCancelDownload} onRemoveDownload={onRemoveDownload} onRetryDownload={onRetryDownload} />}
      </div>
    </section>
  );
}
