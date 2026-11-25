import "dotenv/config";
import path from "node:path";

export const config = {
  mode: process.env.APP_MODE || "local",
  region: process.env.AWS_REGION || "ap-southeast-1",
  table: process.env.DYNAMODB_TABLE || "CloudLibraryWorkspace",
  endpoint:
    process.env.DYNAMODB_ENDPOINT ||
    (process.env.APP_MODE === "aws" ? undefined : "http://127.0.0.1:8010"),
  port: Number(process.env.API_PORT || 3001),
  origin: process.env.APP_ORIGIN || "http://127.0.0.1:5173",
  localDir: path.resolve(process.env.LOCAL_DATA_DIR || ".local"),
  bucket: process.env.CONTENT_BUCKET,
  poolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_CLIENT_ID,
  cognitoDomain: process.env.COGNITO_DOMAIN,
  clientSecret: process.env.COGNITO_CLIENT_SECRET,
  modelId: process.env.BEDROCK_MODEL_ID,
  knowledgeBaseId: process.env.BEDROCK_KNOWLEDGE_BASE_ID,
  dataSourceId: process.env.BEDROCK_DATA_SOURCE_ID,
  emailFrom: process.env.SES_FROM_EMAIL,
};
if (!["local", "aws"].includes(config.mode))
  throw new Error("APP_MODE must be local or aws");
if (
  config.mode === "aws" &&
  (config.endpoint || !config.bucket || !config.poolId || !config.clientId)
) {
  throw new Error(
    "AWS mode requires Cognito, a content bucket, and AWS DynamoDB (no local endpoint).",
  );
}

export const publicCapabilities = (options = config) => ({
  mode: options.mode,
  database: "DynamoDB",
  region: options.region,
  authentication: options.mode === "aws" ? "Cognito" : "local",
  cognitoDomain: options.cognitoDomain || null,
  cognitoClientId: options.mode === "aws" ? options.clientId : null,
  ai: Boolean(options.modelId),
  knowledgeBase: Boolean(options.knowledgeBaseId),
  email: Boolean(options.emailFrom),
  transcribe: options.mode === "aws",
  polly: options.mode === "aws",
  vietnameseSpeech: Boolean(process.env.AZURE_SPEECH_SECRET_ARN),
});
