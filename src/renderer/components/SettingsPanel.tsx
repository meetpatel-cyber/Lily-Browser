import * as React from "react";
import type { BrowserPreferences, SearchEngine, StartupBehavior } from "../../shared/browser";
import { Icon } from "./Icon";

interface SettingsPanelProps {
  preferences: BrowserPreferences;
  onUpdatePreferences: (updates: Partial<BrowserPreferences>) => void;
  onClose: () => void;
}

export function SettingsPanel({ preferences, onUpdatePreferences, onClose }: SettingsPanelProps) {
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
                  checked={preferences.askWhereToSave}
                  onChange={(e) => onUpdatePreferences({ askWhereToSave: e.target.checked })}
                  style={{ cursor: "pointer" }}
                />
                Ask where to save each file before downloading
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
