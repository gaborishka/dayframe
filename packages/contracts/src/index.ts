export * from "./types.js";
export * from "./validators.js";

export const generationJobStages = [
  "ingesting",
  "generating_script",
  "validating",
  "rendering_panels",
  "composing",
  "storing"
] as const;

export const generationJobStatuses = [
  "queued",
  "retry_scheduled",
  "ingesting",
  "generating_script",
  "validating",
  "rendering_panels",
  "composing",
  "storing",
  "ready",
  "failed"
] as const;
