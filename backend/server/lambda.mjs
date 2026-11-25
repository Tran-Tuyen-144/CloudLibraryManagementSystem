import serverless from "serverless-http";
import { createRepository } from "./repository.mjs";
import { createApp } from "./app.mjs";
import { runReminders } from "./workers.mjs";
import { seedRepository } from "./seed.mjs";
import { processAudio } from "./audio.mjs";
import { syncKnowledgeLibrary } from "./knowledge.mjs";
const repo = createRepository();
const app = serverless(createApp(repo));
export const handler = async (event, context) => app(event, context);
export const reminders = async () => runReminders(repo);
export const knowledgeSync = async () => syncKnowledgeLibrary(repo);
export const audioWorker = async (event) => {
  const name =
    event.detail?.TranscriptionJobName || event.detail?.TranscriptionJobName?.S;
  if (typeof name === "string" && name.startsWith("cloudlibrary-"))
    return processAudio(repo, name.slice("cloudlibrary-".length));
  const pending = (await repo.read()).audioJobs
    .filter(
      (j) =>
        ["transcribing", "answering"].includes(j.status) &&
        (!j.leaseExpiresAt || j.leaseExpiresAt < Date.now()),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (pending[0]) return processAudio(repo, pending[0].id);
};

export const initialize = async () => {
  await seedRepository(repo);
  return { ok: true };
};
