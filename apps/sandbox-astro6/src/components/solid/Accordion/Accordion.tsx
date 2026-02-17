import { createSignal, For } from 'solid-js';

const Accordion = (props) => {
  const [openIndexes, setOpenIndexes] = createSignal([]);

  const toggleItem = (index) => {
    if (props.allowMultiple) {
      setOpenIndexes((prev) =>
        prev.includes(index)
          ? prev.filter((i) => i !== index)
          : [...prev, index]
      );
    } else {
      setOpenIndexes((prev) =>
        prev.includes(index) ? [] : [index]
      );
    }
  };

  const isOpen = (index) => openIndexes().includes(index);

  return (
    <div data-testid="solid-accordion" class="accordion">
      <For each={props.items || []}>
        {(item, index) => (
          <div class="accordion-item">
            <button
              class="accordion-header"
              onClick={() => toggleItem(index())}
              aria-expanded={isOpen(index())}
            >
              {item.title}
              <span class="accordion-icon">
                {isOpen(index()) ? '−' : '+'}
              </span>
            </button>
            {isOpen(index()) && (
              <div class="accordion-content">
                {item.content}
              </div>
            )}
          </div>
        )}
      </For>
      <style>{`
        .accordion {
          border: 1px solid #30363d;
          border-radius: 8px;
          overflow: hidden;
        }
        .accordion-item {
          border-bottom: 1px solid #30363d;
        }
        .accordion-item:last-child {
          border-bottom: none;
        }
        .accordion-header {
          width: 100%;
          padding: 1rem;
          background: #21262d;
          border: none;
          text-align: left;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 1rem;
          font-weight: 500;
          color: #c9d1d9;
          transition: background 0.2s;
        }
        .accordion-header:hover {
          background: #292e36;
        }
        .accordion-icon {
          font-size: 1.25rem;
          font-weight: bold;
          color: #8b949e;
        }
        .accordion-content {
          padding: 1rem;
          background: #161b22;
          color: #c9d1d9;
        }
      `}</style>
    </div>
  );
};

export default Accordion;
