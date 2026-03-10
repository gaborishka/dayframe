import { spawn } from "node:child_process";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...options
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

async function waitFor(url, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the service becomes reachable.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  await run("pnpm", ["db:start"]);
  await run("pnpm", ["db:migrate"]);

  const devProcess = spawn("pnpm", ["dev"], {
    stdio: "inherit",
    shell: false
  });

  try {
    await waitFor("http://127.0.0.1:4000/health");
    await waitFor("http://127.0.0.1:3000");
    await run("pnpm", ["exec", "playwright", "test"]);
  } finally {
    devProcess.kill("SIGTERM");
    await run("pnpm", ["db:stop"]).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
