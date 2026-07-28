import * as React from "react";
import { useState } from "react";
import type { AppearanceMode, BrowserPreferences, SearchEngine, SitePermissions, StartupBehavior } from "../../shared/browser";
import { Icon } from "./Icon";

interface SettingsPanelProps {
  preferences: BrowserPreferences;
  permissions: SitePermissions;
  onUpdatePreferences: (updates: Partial<BrowserPreferences>) => void;
  onClose: () => void;
}

export function SettingsPanel({ preferences, permissions, onUpdatePreferences, onClose }: SettingsPanelProps) {
  const [clearHistory, setClearHistory] = useState(true);
  const [clearCookies, setClearCookies] = useState(false);
  const [clearCache, setClearCache] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const handleClearData = async () => {
    if (!clearHistory && !clearCookies && !clearCache) return;
    if (!window.confirm("Are you sure you want to clear the selected browsing data?")) return;
    
    setIsClearing(true);
    setClearError(null);
    try {
      await window.lilyBrowser.clearBrowsingData({ history: clearHistory, cookies: clearCookies, cache: clearCache });
      setClearHistory(false);
      setClearCookies(false);
      setClearCache(false);
    } catch {
      setClearError("Failed to clear some browsing data. Please try again.");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <section className="library-panel" aria-label="Settings">
      <div className="library-panel__header">
        <div>
          <span className="library-panel__eyebrow">Lily Browser</span>
          <h2>Settings</h2>
        </div>
        <button className="library-close" type="button" aria-label="Close settings" title="Close settings" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>

      <div className="library-panel__content settings-panel__content">
        <div className="library-panel__section-heading">
          <h3>General</h3>
        </div>

        <div className="settings-group">
          <div className="settings-item">
            <div className="settings-item__info">
              <label htmlFor="search-engine">Default Search Engine</label>
              <p>Used when searching from the address bar.</p>
            </div>
            <select
              id="search-engine"
              className="settings-select"
              value={preferences.searchEngine}
              onChange={(e) => onUpdatePreferences({ searchEngine: e.target.value as SearchEngine })}
            >
              <option value="duckduckgo">DuckDuckGo</option>
              <option value="google">Google</option>
              <option value="bing">Bing</option>
            </select>
          </div>

          <div className="settings-item">
            <div className="settings-item__info">
              <label htmlFor="startup-behavior">On Startup</label>
              <p>What should happen when Lily Browser launches.</p>
            </div>
            <select
              id="startup-behavior"
              className="settings-select"
              value={preferences.startupBehavior}
              onChange={(e) => onUpdatePreferences({ startupBehavior: e.target.value as StartupBehavior })}
            >
              <option value="continue">Continue where you left off</option>
              <option value="new-tab">Open New Tab</option>
            </select>
          </div>

          <div className="settings-item">
            <div className="settings-item__info">
              <label htmlFor="appearance">Appearance</label>
            </div>
            <select
              id="appearance"
              className="settings-select"
              value={preferences.appearance}
              onChange={(e) => onUpdatePreferences({ appearance: e.target.value as AppearanceMode })}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>

        <div className="library-panel__section-heading" style={{ marginTop: "24px" }}>
          <h3>Downloads</h3>
        </div>

        <div className="settings-group">
          <div className="settings-item">
            <div className="settings-item__info">
              <label>Download Location</label>
              <div className="settings-path-row" style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <p className="settings-path" style={{ margin: 0, wordBreak: "break-all" }}>{preferences.downloadLocation}</p>
                <button
                  type="button"
                  className="settings-button"
                  onClick={async () => {
                    const newLocation = await window.lilyBrowser.chooseDownloadLocation();
                    if (newLocation) onUpdatePreferences({ downloadLocation: newLocation });
                  }}
                  style={{ flexShrink: 0 }}
                >
                  Change...
                </button>
              </div>
            </div>
          </div>

          <div className="settings-item">
            <div className="settings-item__info">
              <label htmlFor="ask-where-to-save" style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  id="ask-where-to-save"
                  type="checkbox"
                  className="settings-checkbox"
                  checked={preferences.askWhereToSave}
                  onChange={(e) => onUpdatePreferences({ askWhereToSave: e.target.checked })}
                  style={{ cursor: "pointer" }}
                />
                Ask where to save each file before downloading
              </label>
            </div>
          </div>
        </div>

        <div className="library-panel__section-heading" style={{ marginTop: "24px" }}>
          <h3>Privacy & Security</h3>
        </div>

        <div className="settings-group">
          <div className="settings-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: "12px" }}>
            <div className="settings-item__info">
              <label>Clear Browsing Data</label>
              <p>Select the data you want to remove from Lily Browser.</p>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", color: "var(--fg-base)" }}>
                <input
                  type="checkbox"
                  className="settings-checkbox"
                  checked={clearHistory}
                  onChange={(e) => setClearHistory(e.target.checked)}
                  disabled={isClearing}
                />
                Browsing History
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", color: "var(--fg-base)" }}>
                <input
                  type="checkbox"
                  className="settings-checkbox"
                  checked={clearCookies}
                  onChange={(e) => setClearCookies(e.target.checked)}
                  disabled={isClearing}
                />
                Cookies and Site Data
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", color: "var(--fg-base)" }}>
                <input
                  type="checkbox"
                  className="settings-checkbox"
                  checked={clearCache}
                  onChange={(e) => setClearCache(e.target.checked)}
                  disabled={isClearing}
                />
                Cached Images and Files
              </label>
            </div>

            {clearError && (
              <p style={{ margin: "4px 0 0", color: "var(--error)", fontSize: "13px" }}>{clearError}</p>
            )}

            <button
              type="button"
              className="settings-button settings-button--danger"
              onClick={handleClearData}
              disabled={isClearing || (!clearHistory && !clearCookies && !clearCache)}
              style={{ marginTop: "8px", alignSelf: "flex-start" }}
            >
              {isClearing ? "Clearing..." : "Clear Data"}
            </button>
          </div>

          <div style={{ borderTop: "1px solid var(--border-base)", margin: "8px 0" }} />
          
          <div className="settings-item">
            <div className="settings-item__info">
              <label>Site Permissions</label>
              <p>Control what sites are allowed to do.</p>
            </div>
          </div>
          {(!permissions || Object.keys(permissions).length === 0) ? (
            <div className="settings-item">
              <p style={{ color: "var(--fg-muted)", fontSize: "13px" }}>No site permissions saved.</p>
            </div>
          ) : (
            <>
              {Object.entries(permissions).map(([origin, perms]) => {
                const url = new URL(origin);
                const hostname = url.hostname;
                
                return (
                  <div key={origin} className="settings-item" style={{ flexDirection: "column", alignItems: "stretch", gap: "12px", padding: "16px", background: "var(--bg-panel)", border: "1px solid var(--border-base)", borderRadius: "8px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--fg-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hostname}</div>
                      <div style={{ fontSize: "12px", color: "var(--fg-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{origin}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                      {Object.entries(perms).map(([category, decision]) => (
                        <div key={category} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "var(--fg-base)" }}>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ textTransform: "capitalize", fontWeight: 500 }}>{category}</span>
                            <span style={{ color: decision === "allow" ? "var(--success)" : "var(--error)", fontSize: "12px" }}>
                              {decision === "allow" ? "Allow" : "Block"}
                            </span>
                          </div>
                          <button 
                            className="settings-button" 
                            title="Reset permission"
                            style={{ padding: "4px 8px", fontSize: "12px" }}
                            onClick={() => void window.lilyBrowser.removePermission(origin, category)}
                          >
                            Reset
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="settings-item" style={{ marginTop: "8px" }}>
                <button
                  type="button"
                  className="settings-button settings-button--danger"
                  onClick={() => {
                    if (window.confirm("Are you sure you want to clear ALL saved site permissions? This cannot be undone.")) {
                      void window.lilyBrowser.clearAllPermissions();
                    }
                  }}
                  style={{ alignSelf: "flex-start" }}
                >
                  Clear All Permissions
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </section>
  );
}
