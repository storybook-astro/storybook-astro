import { useEffect, useRef, useState } from 'preact/hooks';
import styles from '../styles/codeTabs.module.css';

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
  const selection = globalThis.document?.getSelection?.();

  if (!selection) {return;}

  const range = globalThis.document.createRange();

  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

function fallbackCopyToClipboard(text) {
  const doc = globalThis.document;

  if (!doc) {return false;}

  const textarea = doc.createElement('textarea');

  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  doc.body.append(textarea);
  textarea.select();
  const didCopy = doc.execCommand('copy');

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

      globalThis.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const scheduleStatusReset = () => {
    if (resetTimerRef.current) {
      globalThis.clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = globalThis.setTimeout(() => {
      setCopyStatus('idle');
    }, COPY_STATUS_RESET_MS);
  };

  const selectCode = () => {
    if (!codeElementRef.current) {return;}

    selectNodeContents(codeElementRef.current);
  };

  const copyCommand = async () => {
    try {
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(activeTab.command);

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
    <div class={styles.installTabs} data-testid="preact-code-tabs">
      <div class={styles.toolbar}>
        <div class={styles.list} role="tablist" aria-label="Package manager command switcher">
          {commandTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeId === tab.id}
              class={`${styles.tab} ${activeId === tab.id ? styles.tabActive : ''}`}
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
          class={`${styles.copy} ${copyStatus === 'copied' ? styles.copyCopied : ''}`}
          aria-label={copyStatus === 'copied' ? 'Copied to clipboard' : 'Copy install command'}
          onClick={() => {
            void handleCopy();
          }}
        >
          {copyStatus === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        class={styles.panel}
        onClick={() => {
          void handleCopy();
        }}
      >
        <code ref={codeElementRef}>{activeTab.command}</code>
      </pre>
      <span class={styles.sr} aria-live="polite">{statusMessage}</span>
    </div>
  );
}
