import { loadApiEnv } from "@dayframe/config";

import { createApp } from "./app.js";

const env = loadApiEnv(import.meta.dirname);
const app = createApp();

app.listen(env.API_PORT, env.API_HOST, () => {
  console.log(`DayFrame API listening on http://${env.API_HOST}:${env.API_PORT}`);
});
