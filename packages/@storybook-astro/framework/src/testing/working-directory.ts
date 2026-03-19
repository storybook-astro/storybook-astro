let workingDirectoryLock: Promise<void> = Promise.resolve();

export async function runWithWorkingDirectory<T>(dir: string, fn: () => Promise<T>) {
  const previousLock = workingDirectoryLock;
  let releaseLock!: () => void;

  workingDirectoryLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  await previousLock;

  const previousCwd = process.cwd();

  try {
    if (previousCwd !== dir) {
      process.chdir(dir);
    }

    return await fn();
  } finally {
    if (process.cwd() !== previousCwd) {
      process.chdir(previousCwd);
    }

    releaseLock();
  }
}
