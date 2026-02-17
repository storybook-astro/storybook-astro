import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(1);

  return (
    <div data-testid="react-counter">
      <span>React counter: {count}</span>
      <button onClick={() => setCount(count + 1)}>+1</button>
    </div>
  );
}

export default Counter;
