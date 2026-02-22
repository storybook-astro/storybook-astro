import { useState } from 'react';

const commandTabs = [
  {
    id: 'npm',
    label: 'npm',
    command: 'npm install -D storybook @storybook/builder-vite @storybook-astro/framework',
  },
  {
    id: 'yarn',
    label: 'yarn',
    command: 'yarn add -D storybook @storybook/builder-vite @storybook-astro/framework',
  },
  {
    id: 'pnpm',
    label: 'pnpm',
    command: 'pnpm add -D storybook @storybook/builder-vite @storybook-astro/framework',
  },
  {
    id: 'bun',
    label: 'bun',
    command: 'bun add -d storybook @storybook/builder-vite @storybook-astro/framework',
  },
];

function CodeTabs() {
  const [activeId, setActiveId] = useState(commandTabs[0].id);
  const activeTab = commandTabs.find((tab) => tab.id === activeId) ?? commandTabs[0];

  return (
    <div data-testid="react-code-tabs" className="code-tabs">
      <div className="code-tabs__list" role="tablist" aria-label="Package manager command switcher">
        {commandTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeId === tab.id}
            className={`code-tabs__tab ${activeId === tab.id ? 'is-active' : ''}`}
            onClick={() => {
              setActiveId(tab.id);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <pre className="code-tabs__panel"><code className="code-tabs__code">{activeTab.command}</code></pre>
      <style>{`
        .code-tabs {
          border: 1px solid #30363d;
          border-radius: 10px;
          overflow: hidden;
          background: #0d1117;
          text-align: left;
        }
        .code-tabs__list {
          display: flex;
          flex-wrap: wrap;
          border-bottom: 1px solid #30363d;
          background: #161b22;
        }
        .code-tabs__tab {
          appearance: none;
          border: 0;
          border-right: 1px solid #30363d;
          background: transparent;
          color: #8b949e;
          padding: 0.6rem 0.9rem;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .code-tabs__tab:last-child {
          border-right: 0;
        }
        .code-tabs__tab:hover {
          background: #21262d;
          color: #c9d1d9;
        }
        .code-tabs__tab.is-active {
          background: transparent;
          color: #d18be8;
          font-weight: 700;
          box-shadow: inset 0 -2px 0 #d18be8;
        }
        .code-tabs__panel {
          margin: 0;
          padding: 0.85rem 1rem;
          border: 0;
          background: transparent;
          box-shadow: none;
          color: #c9d1d9;
          font-size: 0.82rem;
          line-height: 1.5;
          overflow-x: auto;
        }
        .code-tabs__code {
          background: transparent;
          border: 0;
          padding: 0;
          color: inherit;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}

export default CodeTabs;
