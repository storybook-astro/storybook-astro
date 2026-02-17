import { createSignal } from 'solid-js';

const Counter = () => {
  const [count, setCount] = createSignal(1);

  return (
    <div data-testid="solid-counter">
      <span>Solid counter: {count()}</span>
      {' '}
      <button
        onClick={() => {
          setCount((prev) => prev + 1);
        }}
      >
        +1
      </button>
    </div>
  );
};

export default Counter;
