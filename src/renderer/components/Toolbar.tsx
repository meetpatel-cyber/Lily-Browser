import { type FormEvent, type RefObject } from "react";
import { Icon } from "./Icon";

interface ToolbarProps {
  address: string;
  activeUrl?: string;
  hasError: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  addressRef: RefObject<HTMLInputElement | null>;
  onAddressChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  canBookmark: boolean;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onOpenLibrary: () => void;
}

function NavigationButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function SecurityIcon({ url, hasError }: { url?: string; hasError: boolean }) {
  if (!url) return <Icon name="search" size={17} />;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && !hasError) {
      return (
        <span className="address-form__security address-form__security--secure" title="Connection is secure (HTTPS)" aria-label="Connection is secure">
          <Icon name="lock" size={16} />
        </span>
      );
    }
    if (parsed.protocol === "http:" || (parsed.protocol === "https:" && hasError)) {
      return (
        <span className="address-form__security address-form__security--not-secure" title="Connection is not secure" aria-label="Connection is not secure">
          <Icon name="lock-open" size={16} />
        </span>
      );
    }
  } catch {
    // Neutral fallback
  }
  return <Icon name="search" size={17} />;
}

export function Toolbar({ address, activeUrl, hasError, isLoading, canGoBack, canGoForward, addressRef, onAddressChange, onSubmit, onBack, onForward, onReload, onHome, canBookmark, isBookmarked, onToggleBookmark, onOpenLibrary }: ToolbarProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="toolbar">
      <div className="toolbar__navigation" aria-label="Navigation controls">
        <NavigationButton label="Back (Alt+Left)" disabled={!canGoBack} onClick={onBack}><Icon name="back" /></NavigationButton>
        <NavigationButton label="Forward (Alt+Right)" disabled={!canGoForward} onClick={onForward}><Icon name="forward" /></NavigationButton>
        <NavigationButton label="Reload (Ctrl+R)" onClick={onReload}><Icon name="reload" /></NavigationButton>
        <NavigationButton label="Home (Alt+Home)" onClick={onHome}><Icon name="home" /></NavigationButton>
      </div>
      <form className="address-form" onSubmit={submit}>
        <SecurityIcon url={activeUrl} hasError={hasError} />
        <input
          ref={addressRef}
          aria-label="Search or enter web address"
          autoComplete="off"
          spellCheck={false}
          value={address}
          placeholder="Search or enter address"
          onChange={(event) => onAddressChange(event.target.value)}
        />
        {isLoading && <span className="address-form__loading" aria-label="Loading" />}
      </form>
      <div className="toolbar__actions">
        <NavigationButton label={isBookmarked ? "Remove bookmark" : "Bookmark this page"} disabled={!canBookmark} onClick={onToggleBookmark}><Icon name="star" filled={isBookmarked} /></NavigationButton>
        <NavigationButton label="Open library" onClick={onOpenLibrary}><Icon name="library" /></NavigationButton>
      </div>
    </div>
  );
}
