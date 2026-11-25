import { createRepository } from "./repository.mjs";
import { createApp } from "./app.mjs";
import { seedRepository } from "./seed.mjs";
import { runReminders } from "./workers.mjs";
import { config } from "./config.mjs";
import { syncLegacySource } from "./legacy-source.mjs";
const repo = createRepository();
await repo.initialize();
await seedRepository(repo);
await syncLegacySource(repo);
const server = createApp(repo).listen(config.port, "127.0.0.1", () =>
  console.log(
    `Cloud Library API: http://127.0.0.1:${config.port} — DynamoDB ${config.table}`,
  ),
);
let ticking = false;
const timer = setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    await runReminders(repo);
    await syncLegacySource(repo);
  } catch (error) {
    console.error("Reminder worker:", error.name);
  } finally {
    ticking = false;
  }
}, 60000);
const close = () => {
  clearInterval(timer);
  server.close(() => {
    repo.client.destroy();
    process.exit(0);
  });
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
