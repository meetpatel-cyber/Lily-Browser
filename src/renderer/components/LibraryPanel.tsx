import type { Bookmark, DownloadRecord, HistoryEntry } from "../../shared/browser";
import { Icon } from "./Icon";

export type LibrarySection = "bookmarks" | "history" | "downloads";

interface LibraryPanelProps {
  section: LibrarySection;
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  downloads: DownloadRecord[];
  onSectionChange: (section: LibrarySection) => void;
  onClose: () => void;
  onOpenUrl: (url: string) => void;
  onRemoveBookmark: (bookmarkId: string) => void;
  onClearHistory: () => void;
  onOpenDownload: (downloadId: string) => void;
  onRevealDownload: (downloadId: string) => void;
  onPauseDownload: (downloadId: string) => void;
  onResumeDownload: (downloadId: string) => void;
  onCancelDownload: (downloadId: string) => void;
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

function BookmarkList({ bookmarks, onOpenUrl, onRemoveBookmark }: Pick<LibraryPanelProps, "bookmarks" | "onOpenUrl" | "onRemoveBookmark">) {
  if (bookmarks.length === 0) return <EmptyState>Pages you save will appear here.</EmptyState>;
  return (
    <div className="library-list">
      {bookmarks.map((bookmark) => (
        <div className="library-entry" key={bookmark.id}>
          <button className="library-entry__open" type="button" onClick={() => onOpenUrl(bookmark.url)} title={bookmark.url}>
            <Icon name="star" size={16} filled />
            <span><strong>{bookmark.title}</strong><small>{bookmark.url}</small></span>
          </button>
          <button className="library-entry__action" type="button" title="Delete bookmark" aria-label={`Delete ${bookmark.title}`} onClick={() => onRemoveBookmark(bookmark.id)}><Icon name="trash" size={16} /></button>
        </div>
      ))}
    </div>
  );
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const timeFormatter = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

function HistoryList({ history, onOpenUrl }: Pick<LibraryPanelProps, "history" | "onOpenUrl">) {
  if (history.length === 0) return <EmptyState>Pages you visit will appear here.</EmptyState>;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();

  const groups: { label: string; entries: HistoryEntry[]; showTime: boolean }[] = [];

  for (const entry of history) {
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
              </div>
            ))}
          </div>
        </div>
      ))}
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

function DownloadList({ downloads, onOpenDownload, onRevealDownload, onPauseDownload, onResumeDownload, onCancelDownload }: Pick<LibraryPanelProps, "downloads" | "onOpenDownload" | "onRevealDownload" | "onPauseDownload" | "onResumeDownload" | "onCancelDownload">) {
  if (downloads.length === 0) return <EmptyState>Downloads started from websites will appear here.</EmptyState>;
  return (
    <div className="library-list">
      {downloads.map((download) => (
        <div className="library-entry library-entry--download" key={download.id}>
          <span className={`download-icon download-icon--${download.status}`}><Icon name="download" size={17} /></span>
          <span className="library-entry__download-copy"><strong title={download.filename}>{download.filename}</strong><small>{downloadStatus(download)}</small>{download.error && <em>{download.error}</em>}</span>
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
          {download.status === "completed" && <span className="download-actions">
            <button className="library-entry__action" type="button" title="Open downloaded file" aria-label={`Open ${download.filename}`} onClick={() => onOpenDownload(download.id)}><Icon name="open" size={16} /></button>
            <button className="library-entry__action" type="button" title="Show in folder" aria-label={`Show ${download.filename} in folder`} onClick={() => onRevealDownload(download.id)}><Icon name="folder" size={16} /></button>
          </span>}
        </div>
      ))}
    </div>
  );
}

export function LibraryPanel({ section, bookmarks, history, downloads, onSectionChange, onClose, onOpenUrl, onRemoveBookmark, onClearHistory, onOpenDownload, onRevealDownload, onPauseDownload, onResumeDownload, onCancelDownload }: LibraryPanelProps) {
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
          {section === "history" && history.length > 0 && <button className="library-clear" type="button" onClick={onClearHistory}>Clear history</button>}
        </div>
        {section === "bookmarks" && <BookmarkList bookmarks={bookmarks} onOpenUrl={onOpenUrl} onRemoveBookmark={onRemoveBookmark} />}
        {section === "history" && <HistoryList history={history} onOpenUrl={onOpenUrl} />}
        {section === "downloads" && <DownloadList downloads={downloads} onOpenDownload={onOpenDownload} onRevealDownload={onRevealDownload} onPauseDownload={onPauseDownload} onResumeDownload={onResumeDownload} onCancelDownload={onCancelDownload} />}
      </div>
    </section>
  );
}
