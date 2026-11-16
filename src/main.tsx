import React, { createRoot } from './vendor/react-runtime.ts';
import { App } from './App.tsx';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
