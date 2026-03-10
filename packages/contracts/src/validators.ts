import * as Ajv2020Module from "ajv/dist/2020.js";
import * as ajvFormatsModule from "ajv-formats";

import comicScriptSchema from "../../../schemas/ComicScript.schema.json" with { type: "json" };
import dailyContextResponseSchema from "../../../schemas/DailyContextResponse.schema.json" with { type: "json" };
import dayContextSchema from "../../../schemas/DayContext.schema.json" with { type: "json" };
import enrichedDayContextSchema from "../../../schemas/EnrichedDayContext.schema.json" with { type: "json" };
import generationJobSchema from "../../../schemas/GenerationJob.schema.json" with { type: "json" };
import jobStatusResponseSchema from "../../../schemas/JobStatusResponse.schema.json" with { type: "json" };
import sharedSchema from "../../../schemas/shared.schema.json" with { type: "json" };

const Ajv2020 = ((Ajv2020Module as { default?: unknown }).default ?? Ajv2020Module) as new (
  options: Record<string, unknown>
) => {
  addSchema: (schema: object, key?: string) => void;
  getSchema: (key?: string) => ((payload: unknown) => boolean) & { errors?: unknown };
};
const addFormats = ((ajvFormatsModule as { default?: unknown }).default ?? ajvFormatsModule) as (
  ajv: object
) => void;

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

ajv.addSchema(sharedSchema, sharedSchema.$id);
ajv.addSchema(dayContextSchema, dayContextSchema.$id);
ajv.addSchema(dailyContextResponseSchema, dailyContextResponseSchema.$id);
ajv.addSchema(enrichedDayContextSchema, enrichedDayContextSchema.$id);
ajv.addSchema(comicScriptSchema, comicScriptSchema.$id);
ajv.addSchema(generationJobSchema, generationJobSchema.$id);
ajv.addSchema(jobStatusResponseSchema, jobStatusResponseSchema.$id);

const validators = {
  dayContext: ajv.getSchema(dayContextSchema.$id)!,
  dailyContextResponse: ajv.getSchema(dailyContextResponseSchema.$id)!,
  enrichedDayContext: ajv.getSchema(enrichedDayContextSchema.$id)!,
  comicScript: ajv.getSchema(comicScriptSchema.$id)!,
  generationJob: ajv.getSchema(generationJobSchema.$id)!,
  jobStatusResponse: ajv.getSchema(jobStatusResponseSchema.$id)!
};

function formatErrors(name: string, errors: unknown) {
  return `${name} validation failed: ${JSON.stringify(errors, null, 2)}`;
}

export function assertSchema(name: keyof typeof validators, payload: unknown) {
  const validator = validators[name];
  if (!validator(payload)) {
    throw new Error(formatErrors(name, validator.errors));
  }
}

export const validateDayContext = (payload: unknown) => validators.dayContext(payload);
export const validateDailyContextResponse = (payload: unknown) => validators.dailyContextResponse(payload);
export const validateEnrichedDayContext = (payload: unknown) => validators.enrichedDayContext(payload);
export const validateComicScript = (payload: unknown) => validators.comicScript(payload);
export const validateGenerationJob = (payload: unknown) => validators.generationJob(payload);
export const validateJobStatusResponse = (payload: unknown) => validators.jobStatusResponse(payload);
