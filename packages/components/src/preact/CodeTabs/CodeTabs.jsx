/* global window, document, navigator, clearTimeout */

import { useEffect, useRef, useState } from 'preact/hooks';

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

const COPY_STATUS_RESET_MS = 1800;

function selectNodeContents(node) {
  const selection = window.getSelection();

  if (!selection) {return;}

  const range = document.createRange();

  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

function fallbackCopyToClipboard(text) {
  const textarea = document.createElement('textarea');

  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  document.body.append(textarea);
  textarea.select();
  const didCopy = document.execCommand('copy');

  textarea.remove();

  return didCopy;
}

export default function CodeTabs() {
  const [activeId, setActiveId] = useState(commandTabs[0].id);
  const [copyStatus, setCopyStatus] = useState('idle');
  const resetTimerRef = useRef(null);
  const codeElementRef = useRef(null);
  const activeTab = commandTabs.find((tab) => tab.id === activeId) ?? commandTabs[0];

  useEffect(() => {
    return () => {
      if (!resetTimerRef.current) {return;}

      clearTimeout(resetTimerRef.current);
    };
  }, []);

  const scheduleStatusReset = () => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = window.setTimeout(() => {
      setCopyStatus('idle');
    }, COPY_STATUS_RESET_MS);
  };

  const selectCode = () => {
    if (!codeElementRef.current) {return;}

    selectNodeContents(codeElementRef.current);
  };

  const copyCommand = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeTab.command);

        return true;
      }

      return fallbackCopyToClipboard(activeTab.command);
    } catch {
      return fallbackCopyToClipboard(activeTab.command);
    }
  };

  const handleCopy = async () => {
    selectCode();
    const didCopy = await copyCommand();

    setCopyStatus(didCopy ? 'copied' : 'failed');
    scheduleStatusReset();
  };

  const statusMessage = copyStatus === 'copied'
    ? 'Command copied to clipboard'
    : copyStatus === 'failed'
      ? 'Could not auto-copy. Command selected for manual copy'
      : '';

  return (
    <div class="install-tabs" data-testid="install-command-tabs">
      <div class="install-tabs__toolbar">
        <div class="install-tabs__list" role="tablist" aria-label="Package manager command switcher">
          {commandTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeId === tab.id}
              class={`install-tabs__tab ${activeId === tab.id ? 'is-active' : ''}`}
              onClick={() => {
                setActiveId(tab.id);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          class={`install-tabs__copy ${copyStatus === 'copied' ? 'is-copied' : ''}`}
          aria-label={copyStatus === 'copied' ? 'Copied to clipboard' : 'Copy install command'}
          onClick={() => {
            void handleCopy();
          }}
        >
          {copyStatus === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        class="install-tabs__panel"
        onClick={() => {
          void handleCopy();
        }}
      >
        <code
          ref={codeElementRef}
        >
          {activeTab.command}
        </code>
      </pre>
      <span class="install-tabs__sr" aria-live="polite">{statusMessage}</span>
      <style>{`
        .install-tabs {
          width: min(36rem, 100%);
          margin: 0 auto;
          border: 1px solid #30363d;
          border-radius: 10px;
          overflow: hidden;
          background: #0d1117;
          text-align: left;
        }

        .install-tabs__toolbar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: stretch;
          border-bottom: 1px solid #30363d;
          background: #161b22;
        }

        .install-tabs__list {
          display: flex;
          overflow-x: auto;
          scrollbar-width: thin;
        }

        .install-tabs__tab {
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

        .install-tabs__tab:last-child {
          border-right: 0;
        }

        .install-tabs__tab:hover {
          background: #21262d;
          color: #c9d1d9;
        }

        .install-tabs__tab.is-active {
          background: transparent;
          color: #d18be8;
          font-weight: 700;
          box-shadow: inset 0 -2px 0 #d18be8;
        }

        .install-tabs__copy {
          appearance: none;
          border: 0;
          border-left: 1px solid #30363d;
          background: #161b22;
          color: #8b949e;
          font-size: 0.8rem;
          font-weight: 600;
          padding: 0.6rem 0.95rem;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }

        .install-tabs__copy:hover {
          background: #21262d;
          color: #f0f6fc;
        }

        .install-tabs__copy.is-copied {
          color: #7ee787;
        }

        .install-tabs__panel {
          margin: 0;
          padding: 0.85rem 1rem;
          border: 0;
          background: transparent;
          box-shadow: none;
          color: #c9d1d9;
          font-size: 0.82rem;
          line-height: 1.5;
          overflow-x: auto;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          white-space: nowrap;
          cursor: copy;
          user-select: all;
        }

        .install-tabs__panel code {
          background: transparent;
          border: 0;
          padding: 0;
          color: inherit;
        }

        .install-tabs__sr {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        @media (max-width: 520px) {
          .install-tabs__toolbar {
            grid-template-columns: 1fr;
          }

          .install-tabs__copy {
            border-left: 0;
            border-top: 1px solid #30363d;
          }
        }
      `}</style>
    </div>
  );
}
