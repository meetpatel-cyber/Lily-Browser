import { type FormEvent, useState } from "react";
import { Icon } from "./Icon";

export function NewTabPage({ onNavigate }: { onNavigate: (value: string) => void }) {
  const [query, setQuery] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onNavigate(query);
  };

  return (
    <section className="new-tab-page" aria-label="New tab">
      <div className="new-tab-page__content">
        <div className="lily-mark" aria-hidden="true">L</div>
        <h1>Lily</h1>
        <p>Search the web or enter a site address.</p>
        <form className="new-tab-search" onSubmit={submit}>
          <Icon name="search" size={19} />
          <input aria-label="Search the web" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="What would you like to find?" />
          <button type="submit" aria-label="Search"><Icon name="forward" size={18} /></button>
        </form>
        <span className="new-tab-hint">Tip: press Ctrl+L to focus the address bar.</span>
      </div>
    </section>
  );
}

