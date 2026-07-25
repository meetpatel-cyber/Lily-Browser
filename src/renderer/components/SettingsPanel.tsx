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
              <p className="settings-path">{preferences.downloadLocation}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
