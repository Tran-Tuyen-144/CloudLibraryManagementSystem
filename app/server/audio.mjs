import { randomUUID } from "node:crypto";
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { config } from "./config.mjs";
import { ensure, nowIso, ServiceError } from "./errors.mjs";
import { answerQuestion } from "./ai.mjs";

export async function synthesize(text, language, storage, options = config) {
  ensure(
    typeof text === "string" && text.trim(),
    "invalidInput",
    "Nhập nội dung cần đọc.",
  );
  ensure(
    ["vi-VN", "en-US"].includes(language),
    "invalidLanguage",
    "Chọn tiếng Việt hoặc tiếng Anh.",
  );
  ensure(
    text.length <= 6000,
    "textTooLong",
    "Mỗi lượt nghe tối đa 6.000 ký tự.",
  );
  ensure(
    options.mode === "aws",
    "audioNotConfigured",
    "Bản local dùng giọng đọc của trình duyệt. Tạo MP3 cần kết nối AWS.",
    503,
  );
  let bytes;
  if (language === "vi-VN") {
    ensure(
      process.env.AZURE_SPEECH_SECRET_ARN,
      "voiceNotConfigured",
      "Giọng MP3 tiếng Việt chưa được cấu hình.",
      503,
    );
    const secret = await new SecretsManagerClient({
      region: options.region,
    }).send(
      new GetSecretValueCommand({
        SecretId: process.env.AZURE_SPEECH_SECRET_ARN,
      }),
    );
    const credentials = JSON.parse(secret.SecretString);
    const region = credentials.region;
    ensure(/^[a-z0-9]+$/.test(region), "invalidVoiceRegion");
    const escape = (value) =>
      value.replace(
        /[<>&"']/g,
        (c) =>
          ({
            "<": "&lt;",
            ">": "&gt;",
            "&": "&amp;",
            '"': "&quot;",
            "'": "&apos;",
          })[c],
      );
    const response = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": credentials.key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        },
        body: `<speak version="1.0" xml:lang="vi-VN"><voice name="vi-VN-HoaiMyNeural">${escape(text)}</voice></speak>`,
        signal: AbortSignal.timeout(20000),
      },
    );
    ensure(
      response.ok,
      "voiceUnavailable",
      "Dịch vụ đọc tiếng Việt chưa phản hồi.",
      502,
    );
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    const response = await new PollyClient({ region: options.region }).send(
      new SynthesizeSpeechCommand({
        Text: text,
        OutputFormat: "mp3",
        VoiceId: "Joanna",
        Engine: "neural",
        LanguageCode: "en-US",
      }),
    );
    bytes = Buffer.from(await response.AudioStream.transformToByteArray());
  }
  const key = `audio/output/${randomUUID()}.mp3`;
  await storage.put(key, bytes, "audio/mpeg");
  return key;
}
export async function startAudio(
  repo,
  actor,
  input,
  options = config,
  requestId = randomUUID(),
) {
  ensure(
    options.mode === "aws",
    "transcribeNotConfigured",
    "Nhận dạng bản ghi âm cần kết nối Amazon Transcribe.",
    503,
  );
  const upload = await repo.getSecret("UPLOAD", input.uploadId);
  ensure(
    upload?.ownerId === actor.id &&
      upload.complete &&
      upload.contentType.startsWith("audio/"),
    "invalidAudio",
    "Tệp ghi âm chưa hợp lệ.",
  );
  ensure(
    ["vi-VN", "en-US"].includes(input.language),
    "invalidLanguage",
    "Chọn tiếng Việt hoặc tiếng Anh.",
  );
  let jobId = randomUUID();
  let job = {
    id: jobId,
    userId: actor.id,
    language: input.language,
    status: "transcribing",
    createdAt: nowIso(),
    inputKey: upload.key,
    transcriptionJobName: `cloudlibrary-${jobId}`,
    version: 1,
  };
  const saved = await repo.mutate(
    actor.id,
    requestId,
    {
      action: "audio.create",
      uploadId: input.uploadId,
      language: input.language,
    },
    (state) => {
      state.audioJobs.push(job);
      return { state, result: { id: jobId } };
    },
  );
  jobId = saved.result.id;
  job = saved.state.audioJobs.find((j) => j.id === jobId);
  if (job.status !== "transcribing") return job;
  try {
    await new TranscribeClient({ region: options.region }).send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: job.transcriptionJobName,
        LanguageCode: job.language,
        Media: { MediaFileUri: `s3://${options.bucket}/${upload.key}` },
        OutputBucketName: options.bucket,
        OutputKey: `audio/transcripts/${job.id}.json`,
      }),
    );
  } catch (error) {
    if (error.name === "ConflictException") return job;
    await repo.mutate(
      actor.id,
      randomUUID(),
      { action: "audio.failed", jobId },
      (state) => {
        Object.assign(
          state.audioJobs.find((j) => j.id === jobId),
          {
            status: "failed",
            error: "Chưa khởi chạy được nhận dạng giọng nói.",
          },
        );
        return { state };
      },
    );
    throw error;
  }
  return job;
}
export async function processAudio(
  repo,
  jobId,
  options = config,
  services = {},
) {
  let state = await repo.read();
  const job = state.audioJobs.find((j) => j.id === jobId);
  if (!job || ["completed", "failed"].includes(job.status)) return job;
  if (job.status === "answering" && job.leaseExpiresAt > Date.now()) return job;
  const result = services.transcription
    ? await services.transcription(job)
    : await new TranscribeClient({ region: options.region }).send(
        new GetTranscriptionJobCommand({
          TranscriptionJobName: job.transcriptionJobName,
        }),
      );
  if (result.TranscriptionJob.TranscriptionJobStatus === "FAILED") {
    await repo.mutate(
      job.userId,
      `audio_failed_${job.id}`,
      { jobId, status: "failed" },
      (data) => {
        Object.assign(
          data.audioJobs.find((j) => j.id === jobId),
          {
            status: "failed",
            error:
              "Không nhận dạng được bản ghi âm. Hãy ghi rõ hơn và thử lại.",
          },
        );
        return { state: data };
      },
    );
    return;
  }
  if (result.TranscriptionJob.TranscriptionJobStatus !== "COMPLETED")
    return job;
  // A conditional lease prevents duplicate EventBridge deliveries from generating audio twice.
  const leaseId = randomUUID();
  const leased = await repo.mutate(
    job.userId,
    randomUUID(),
    { jobId, action: "lease" },
    (data) => {
      const current = data.audioJobs.find((j) => j.id === jobId);
      if (
        !current ||
        ["completed", "failed"].includes(current.status) ||
        (current.status === "answering" && current.leaseExpiresAt > Date.now())
      )
        return { state: data, result: { leased: false } };
      current.status = "answering";
      current.leaseId = leaseId;
      current.leaseExpiresAt = Date.now() + 150000;
      return { state: data, result: { leased: true } };
    },
  );
  if (!leased.result.leased) return;
  try {
    const transcript =
      JSON.parse(
        (await repo.storage.get(`audio/transcripts/${job.id}.json`)).toString(
          "utf8",
        ),
      ).results?.transcripts?.[0]?.transcript || "";
    ensure(transcript.trim(), "emptyTranscript", "Bản ghi không có lời nói.");
    state = await repo.read();
    ensure(
      state.accounts.some((a) => a.id === job.userId && a.status === "active"),
      "accountLocked",
      "Tài khoản đã bị khóa.",
      403,
    );
    const answer = await (services.answer || answerQuestion)(
      state,
      transcript.slice(0, 2000),
      [],
      { ...options, actorId: job.userId },
    );
    const outputKey = await (services.speak || synthesize)(
      answer.text.slice(0, 6000),
      job.language,
      repo.storage,
      options,
    );
    await repo.mutate(
      job.userId,
      `audio_done_${job.id}`,
      { jobId, action: "complete" },
      (data) => {
        if (data.audioJobs.find((j) => j.id === jobId)?.leaseId !== leaseId)
          return { state: data };
        Object.assign(
          data.audioJobs.find((j) => j.id === jobId),
          {
            status: "completed",
            transcript,
            answer: answer.text,
            sources: answer.sources,
            outputKey,
            completedAt: nowIso(),
          },
        );
        return { state: data };
      },
    );
  } catch (error) {
    await repo.mutate(
      job.userId,
      `audio_error_${job.id}`,
      { jobId, action: "error" },
      (data) => {
        if (data.audioJobs.find((j) => j.id === jobId)?.leaseId !== leaseId)
          return { state: data };
        Object.assign(
          data.audioJobs.find((j) => j.id === jobId),
          {
            status: "failed",
            error:
              error instanceof ServiceError
                ? error.message
                : "Chưa tạo được câu trả lời audio.",
          },
        );
        return { state: data };
      },
    );
  }
}
