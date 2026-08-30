import { useMemo, useState } from "react";
import { SYMBOL_GROUPS, SYMBOL_REGISTRY } from "./symbols/registry";

export function IsoSymbolSidebar({ onAdd }: { onAdd: (symbolId: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SYMBOL_GROUPS.map((group, index) => [group.id, index < 3])),
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return SYMBOL_REGISTRY;
    return SYMBOL_REGISTRY.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.id.toLowerCase().includes(needle) ||
        item.group.includes(needle),
    );
  }, [query]);

  return (
    <aside className="iso-sidebar" data-testid="iso-sidebar">
      <header className="iso-sidebar__head">
        <p className="iso-sidebar__kicker">ISO 14084-2</p>
        <h2>ISO 객체</h2>
        <input
          className="iso-sidebar__search"
          data-testid="iso-sidebar-search"
          placeholder="심볼 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </header>
      <div className="iso-sidebar__groups">
        {SYMBOL_GROUPS.map((group) => {
          const items = filtered.filter((item) => item.group === group.id);
          if (items.length === 0) return null;
          const expanded = query.trim() ? true : open[group.id] !== false;
          return (
            <section key={group.id} className="iso-sidebar__group">
              <button
                type="button"
                className="iso-sidebar__group-btn"
                data-testid={`iso-group-${group.id}`}
                onClick={() => setOpen((current) => ({ ...current, [group.id]: !expanded }))}
              >
                <span>
                  {group.clause} {group.labelKo}
                </span>
                <small>{group.label}</small>
              </button>
              {expanded ? (
                <div className="iso-sidebar__tiles">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="iso-sidebar__tile"
                      title={item.label}
                      data-testid={`btn-add-equipment-${item.id}`}
                      onClick={() => onAdd(item.id)}
                    >
                      <span className="iso-sidebar__icon">{item.render(item.label)}</span>
                      <span className="iso-sidebar__name">{item.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
