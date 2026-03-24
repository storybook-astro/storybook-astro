import {
  TESTING_RENDERER_DAEMON_URL_ENV,
  startTestingRendererDaemon
} from '../testing/renderer-daemon.ts';

export default async function globalSetup() {
  const daemon = await startTestingRendererDaemon();

  // Workers discover the shared renderer via env instead of creating their own SSR stack.
  process.env[TESTING_RENDERER_DAEMON_URL_ENV] = daemon.url;

  return async () => {
    await daemon.close();
    delete process.env[TESTING_RENDERER_DAEMON_URL_ENV];
  };
}
