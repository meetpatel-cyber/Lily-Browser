import { useEffect, useState } from "react";
import type { FindState } from "../../shared/browser";
import { Icon } from "./Icon";

interface FindInPageProps {
  tabId: string;
  findState?: FindState;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
}

export function FindInPage({ tabId, findState, inputRef, onClose }: FindInPageProps) {
  const [text, setText] = useState(findState?.text || "");

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (findState?.text && findState.text !== text) {
      setText(findState.text);
    }
  }, [findState?.text]);

  const handleSearch = (searchText: string, forward = true, findNext = false) => {
    if (searchText) {
      void window.lilyBrowser.findInPage(tabId, searchText, forward, findNext);
    } else {
      void window.lilyBrowser.stopFindInPage(tabId, false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);
    handleSearch(val, true, true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch(text, !e.shiftKey, false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const activeMatch = findState?.activeMatchOrdinal || 0;
  const matches = findState?.matches || 0;
  const showCount = text.length > 0;

  return (
    <div className="find-in-page" role="search" aria-label="Find in page">
      <input
        ref={inputRef}
        type="text"
        className="find-in-page__input"
        placeholder="Find in page"
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {showCount && (
        <span className="find-in-page__count">
          {matches > 0 ? `${activeMatch} / ${matches}` : "0 / 0"}
        </span>
      )}
      <button 
        type="button" 
        className="icon-button" 
        onClick={() => handleSearch(text, false, false)}
        disabled={!text}
        title="Previous match"
      >
        <Icon name="back" size={16} />
      </button>
      <button 
        type="button" 
        className="icon-button" 
        onClick={() => handleSearch(text, true, false)}
        disabled={!text}
        title="Next match"
      >
        <Icon name="forward" size={16} />
      </button>
      <div className="find-in-page__divider" />
      <button 
        type="button" 
        className="icon-button" 
        onClick={onClose}
        title="Close"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
    </div>
  );
}
