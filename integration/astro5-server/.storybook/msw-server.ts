import { setupServer } from 'msw/node';

const server = setupServer();
let isListening = false;

export function getMswServer() {
  if (!isListening) {
    server.listen({ onUnhandledRequest: 'bypass' });
    isListening = true;
  }

  return server;
}
