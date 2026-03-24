<script lang="ts">
  import { onDestroy } from 'svelte';

  const commandTabs = [
    {
      id: 'npm',
      label: 'npm',
      command: 'npm install -D storybook @storybook/builder-vite @storybook-astro/framework'
    },
    {
      id: 'yarn',
      label: 'yarn',
      command: 'yarn add -D storybook @storybook/builder-vite @storybook-astro/framework'
    },
    {
      id: 'pnpm',
      label: 'pnpm',
      command: 'pnpm add -D storybook @storybook/builder-vite @storybook-astro/framework'
    },
    {
      id: 'bun',
      label: 'bun',
      command: 'bun add -d storybook @storybook/builder-vite @storybook-astro/framework'
    }
  ];

  const COPY_STATUS_RESET_MS = 1800;

  let activeId = commandTabs[0].id;
  let copyStatus: 'idle' | 'copied' | 'failed' = 'idle';
  let codeElementRef: globalThis.HTMLElement;
  let resetTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  const getActiveTab = (id: string) => commandTabs.find((tab) => tab.id === id) ?? commandTabs[0];

  const selectNodeContents = (node: globalThis.Node) => {
    const selection = globalThis.document?.getSelection?.();

    if (!selection) {return;}

    const range = globalThis.document.createRange();

    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const fallbackCopyToClipboard = (text: string) => {
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
  };

  const scheduleStatusReset = () => {
    if (resetTimer) {
      globalThis.clearTimeout(resetTimer);
    }

    resetTimer = globalThis.setTimeout(() => {
      copyStatus = 'idle';
    }, COPY_STATUS_RESET_MS);
  };

  const selectCode = () => {
    if (!codeElementRef) {return;}

    selectNodeContents(codeElementRef);
  };

  const copyCommand = async () => {
    try {
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(getActiveTab(activeId).command);

        return true;
      }

      return fallbackCopyToClipboard(getActiveTab(activeId).command);
    } catch {
      return fallbackCopyToClipboard(getActiveTab(activeId).command);
    }
  };

  const handleCopy = async () => {
    selectCode();
    const didCopy = await copyCommand();

    copyStatus = didCopy ? 'copied' : 'failed';
    scheduleStatusReset();
  };

  const statusMessage = () => {
    if (copyStatus === 'copied') {return 'Command copied to clipboard';}
    if (copyStatus === 'failed') {return 'Could not auto-copy. Command selected for manual copy';}

    return '';
  };

  onDestroy(() => {
    if (!resetTimer) {return;}

    globalThis.clearTimeout(resetTimer);
  });
</script>

<div data-testid="svelte-code-tabs" class="install-tabs">
  <div class="install-tabs__toolbar">
    <div class="install-tabs__list" role="tablist" aria-label="Package manager command switcher">
      {#each commandTabs as tab (tab.id)}
        <button
          type="button"
          role="tab"
          aria-selected={activeId === tab.id}
          class="install-tabs__tab"
          class:is-active={activeId === tab.id}
          onclick={() => {
            activeId = tab.id;
          }}
        >
          {tab.label}
        </button>
      {/each}
    </div>
    <button
      type="button"
      class="install-tabs__copy"
      class:is-copied={copyStatus === 'copied'}
      aria-label={copyStatus === 'copied' ? 'Copied to clipboard' : 'Copy install command'}
      onclick={() => {
        void handleCopy();
      }}
    >
      {copyStatus === 'copied' ? 'Copied' : 'Copy'}
    </button>
  </div>
  <pre
    class="install-tabs__panel"
    onclick={() => {
      void handleCopy();
    }}
  ><code bind:this={codeElementRef}>{getActiveTab(activeId).command}</code></pre>
  <span class="install-tabs__sr" aria-live="polite">{statusMessage()}</span>
</div>

<style>
  .install-tabs {
    width: min(36rem, 100%);
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
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
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
</style>
