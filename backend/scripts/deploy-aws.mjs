import { spawnSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

const userAws = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, "Programs/Amazon/AWSCLIV2/aws.exe")
  : "";
const awsExecutable =
  process.platform === "win32" && userAws && existsSync(userAws)
    ? userAws
    : "aws";

const args = process.argv.slice(2);
const configFile = args.includes("--config")
  ? args[args.indexOf("--config") + 1]
  : "infra/deploy.local.json";
const settings = JSON.parse(
  (await readFile(configFile, "utf8")).replace(/^\uFEFF/, ""),
);
if (!/^[a-z][a-z0-9-]{2,35}$/.test(settings.stackName))
  throw new Error("stackName cần 3–36 chữ thường, số hoặc dấu gạch ngang.");
if (settings.region !== "ap-southeast-1")
  throw new Error("Cấu hình dự án đã chọn Singapore (ap-southeast-1).");
if (
  Boolean(settings.parameters?.BedrockModelId) !==
  Boolean(settings.parameters?.BedrockModelArn)
)
  throw new Error(
    "Cần điền đồng thời BedrockModelId và BedrockModelArn đã kiểm tra quyền gọi.",
  );
const apply = args.includes("--apply");
const awsArgs = [
  "--region",
  settings.region,
  ...(settings.profile ? ["--profile", settings.profile] : []),
];
function run(command, params, { capture = false, env = process.env } = {}) {
  const result = spawnSync(command, params, {
    encoding: "utf8",
    windowsHide: true,
    env,
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error)
    throw new Error(
      "Chưa chạy được công cụ: " + command + " (" + result.error.code + ").",
    );
  if (result.status !== 0)
    throw new Error(
      "Bước triển khai chưa thành công: " +
        params.slice(0, 2).join(" ") +
        (capture ? "\n" + result.stderr : ""),
    );
  return result.stdout;
}
const aws = (params, options) =>
  run(awsExecutable, [...params, ...awsArgs], options);
const npmCli =
  process.env.npm_execpath ||
  path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const npm = (script, env) =>
  run(process.execPath, [npmCli, "run", script], { env: env || process.env });
// AWS CLI uses the user's existing short-lived login/SSO/profile. A console
// password or email is never accepted or written by this deployment script.
const identity = JSON.parse(
  aws(["sts", "get-caller-identity", "--output", "json"], { capture: true }),
);
if (settings.expectedAccount && identity.Account !== settings.expectedAccount)
  throw new Error(
    "Phiên AWS hiện tại thuộc tài khoản khác với tài khoản triển khai đã chọn.",
  );
const artifactBucket =
  settings.artifactBucket ||
  `cloud-library-artifacts-${identity.Account}-${settings.region}`;
const bucketCheck = spawnSync(
  awsExecutable,
  [
    "s3api",
    "head-bucket",
    "--bucket",
    artifactBucket,
    "--expected-bucket-owner",
    identity.Account,
    ...awsArgs,
  ],
  { encoding: "utf8", windowsHide: true },
);
if (bucketCheck.error) throw bucketCheck.error;
if (bucketCheck.status !== 0) {
  if (!/404|Not Found|NoSuchBucket/.test(bucketCheck.stderr || ""))
    throw new Error(
      "Chưa kiểm tra được bucket triển khai. Kiểm tra quyền S3 và Region.",
    );
  aws([
    "s3api",
    "create-bucket",
    "--bucket",
    artifactBucket,
    "--create-bucket-configuration",
    `LocationConstraint=${settings.region}`,
  ]);
  aws([
    "s3api",
    "put-public-access-block",
    "--bucket",
    artifactBucket,
    "--public-access-block-configuration",
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true",
  ]);
  aws([
    "s3api",
    "put-bucket-encryption",
    "--bucket",
    artifactBucket,
    "--server-side-encryption-configuration",
    JSON.stringify({
      Rules: [
        { ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
      ],
    }),
  ]);
}
console.log(
  `Đích triển khai: tài khoản ${identity.Account}, Region ${settings.region}, stack ${settings.stackName}.`,
);
await mkdir(".local", { recursive: true });
npm("build:lambda");
npm("infra:prepare");
aws([
  "cloudformation",
  "package",
  "--template-file",
  "infra/template.json",
  "--s3-bucket",
  artifactBucket,
  "--s3-prefix",
  settings.stackName + "/lambda",
  "--output-template-file",
  ".local/packaged.json",
  "--use-json",
]);
const parameters = {
  ApplicationOrigin: "https://example.invalid",
  ...settings.parameters,
};
try {
  const existing = JSON.parse(
    aws(
      [
        "cloudformation",
        "describe-stacks",
        "--stack-name",
        settings.stackName,
        "--output",
        "json",
      ],
      { capture: true },
    ),
  );
  const origin = existing.Stacks[0].Outputs?.find(
    (o) => o.OutputKey === "WebsiteUrl",
  )?.OutputValue;
  if (origin) parameters.ApplicationOrigin = origin;
} catch {
  /* The initial stack does not exist yet. */
}
const deploy = () => [
  "cloudformation",
  "deploy",
  "--template-file",
  ".local/packaged.json",
  "--stack-name",
  settings.stackName,
  "--capabilities",
  "CAPABILITY_IAM",
  "CAPABILITY_NAMED_IAM",
  "CAPABILITY_AUTO_EXPAND",
  "--no-fail-on-empty-changeset",
  "--parameter-overrides",
  ...Object.entries(parameters).map(([key, value]) => `${key}=${value}`),
];
if (!apply) {
  aws([...deploy(), "--no-execute-changeset"]);
  console.log(
    "Đã tạo change set để xem. Chưa áp dụng thay đổi hạ tầng hoặc xuất bản website. Chạy lại với --apply để triển khai.",
  );
  process.exit(0);
}
aws(deploy());
const stack = JSON.parse(
  aws(
    [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      settings.stackName,
      "--output",
      "json",
    ],
    { capture: true },
  ),
).Stacks[0];
const outputs = Object.fromEntries(
  stack.Outputs.map((o) => [o.OutputKey, o.OutputValue]),
);
parameters.ApplicationOrigin = outputs.WebsiteUrl;
aws(deploy());
npm("build", {
  ...process.env,
  VITE_API_BASE_URL: "/api/v1",
  VITE_AUTH_MODE: "cognito",
});
aws([
  "s3",
  "sync",
  "dist",
  `s3://${outputs.FrontendBucketName}`,
  "--exclude",
  "index.html",
  "--cache-control",
  "public,max-age=31536000,immutable",
]);
aws([
  "s3",
  "cp",
  "dist/index.html",
  `s3://${outputs.FrontendBucketName}/index.html`,
  "--cache-control",
  "no-cache",
  "--content-type",
  "text/html",
]);
aws([
  "lambda",
  "invoke",
  "--function-name",
  outputs.BootstrapFunctionName,
  "--cli-binary-format",
  "raw-in-base64-out",
  "--payload",
  "{}",
  ".local/aws-bootstrap.json",
]);
const bootstrap = JSON.parse(
  await readFile(".local/aws-bootstrap.json", "utf8"),
);
if (!bootstrap.ok)
  throw new Error(
    "Lambda khởi tạo dữ liệu chưa hoàn tất; kiểm tra CloudWatch và aws-bootstrap.json.",
  );
if (outputs.KnowledgeSyncFunctionName)
  aws([
    "lambda",
    "invoke",
    "--function-name",
    outputs.KnowledgeSyncFunctionName,
    "--cli-binary-format",
    "raw-in-base64-out",
    "--payload",
    "{}",
    ".local/aws-knowledge-sync.json",
  ]);
aws([
  "cloudfront",
  "create-invalidation",
  "--distribution-id",
  outputs.DistributionId,
  "--paths",
  "/index.html",
  "/",
]);
await writeFile(
  ".local/aws-outputs.json",
  JSON.stringify(outputs, null, 2) + "\n",
);
console.log("Website đã xuất bản: " + outputs.WebsiteUrl);
console.log(
  "Cần đăng ký, xác minh email, đăng nhập một lần rồi cấp quyền admin bằng scripts/promote-admin.mjs. Không có tài khoản demo trên AWS.",
);
