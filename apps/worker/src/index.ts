import { loadApiEnv, loadWorkerEnv } from "@dayframe/config";

import { claimNextJob, failJob, heartbeatJob, recoverExpiredJobs } from "@dayframe/api/jobs";
import { runPipelineStage } from "@dayframe/api/pipeline";

const workerEnv = loadWorkerEnv(import.meta.dirname);
const apiEnv = loadApiEnv(import.meta.dirname);

let activeJobs = 0;

async function processJob(job: Awaited<ReturnType<typeof claimNextJob>>) {
  if (!job) {
    return;
  }

  const heartbeatTimer = setInterval(() => {
    void heartbeatJob(job.id, workerEnv.WORKER_ID, workerEnv.JOB_LEASE_TTL_SECONDS);
  }, workerEnv.JOB_HEARTBEAT_INTERVAL_SECONDS * 1000);

  try {
    let current = job;

    while (current && !["ready", "failed"].includes(current.status)) {
      const next = await runPipelineStage(current, workerEnv.WORKER_ID, apiEnv);

      if (!next) {
        throw new Error("LEASE_LOST");
      }

      current = next;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker failed to process the job.";
    const code =
      typeof error === "object" && error && "code" in error && typeof error.code === "string"
        ? error.code
        : "JOB_FAILED";
    await failJob(job.id, workerEnv.WORKER_ID, code, message);
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function tick() {
  while (activeJobs < workerEnv.WORKER_CONCURRENCY) {
    const job = await claimNextJob(workerEnv.WORKER_ID, workerEnv.JOB_LEASE_TTL_SECONDS);
    if (!job) {
      break;
    }

    activeJobs += 1;
    void processJob(job).finally(() => {
      activeJobs -= 1;
    });
  }
}

setInterval(() => {
  void recoverExpiredJobs();
}, workerEnv.JOB_RECOVERY_SWEEP_INTERVAL_SECONDS * 1000);

setInterval(() => {
  void tick();
}, 1000);

void tick();

console.log(`DayFrame worker ${workerEnv.WORKER_ID} running with concurrency ${workerEnv.WORKER_CONCURRENCY}`);
