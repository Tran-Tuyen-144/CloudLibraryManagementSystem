import { writeFile, mkdir } from "node:fs/promises";
const ref = (name) => ({ Ref: name });
const sub = (value) => ({ "Fn::Sub": value });
const att = (name, attribute) => ({ "Fn::GetAtt": [name, attribute] });
const iff = (condition, yes, no = ref("AWS::NoValue")) => ({
  "Fn::If": [condition, yes, no],
});
const allow = (Action, Resource, extra = {}) => ({
  Effect: "Allow",
  Action,
  Resource,
  ...extra,
});
const bucket = () => ({
  Type: "AWS::S3::Bucket",
  DeletionPolicy: "Retain",
  UpdateReplacePolicy: "Retain",
  Properties: {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
      ],
    },
    VersioningConfiguration: { Status: "Enabled" },
  },
});
const events = {
  AllPrivate: {
    Type: "HttpApi",
    Properties: {
      ApiId: ref("LibraryApi"),
      Path: "/api/v1/{proxy+}",
      Method: "ANY",
    },
  },
};
for (const [name, route, method] of [
  ["Auth", "/api/v1/auth/{proxy+}", "ANY"],
  ["Snapshot", "/api/v1/snapshot", "GET"],
  ["Books", "/api/v1/books", "GET"],
  ["Book", "/api/v1/books/{id}", "GET"],
  ["Categories", "/api/v1/categories", "GET"],
  ["Views", "/api/v1/books/{id}/views", "POST"],
  ["Health", "/api/v1/health", "GET"],
  ["Files", "/api/v1/files/{id}", "GET"],
])
  events[name] = {
    Type: "HttpApi",
    Properties: {
      ApiId: ref("LibraryApi"),
      Path: route,
      Method: method,
      Auth: { Authorizer: "NONE" },
    },
  };
const environment = {
  APP_MODE: "aws",
  APP_ORIGIN: ref("ApplicationOrigin"),
  DYNAMODB_TABLE: ref("LibraryTable"),
  CONTENT_BUCKET: ref("ContentBucket"),
  COGNITO_USER_POOL_ID: ref("UserPool"),
  COGNITO_CLIENT_ID: ref("UserPoolClient"),
  COGNITO_DOMAIN: sub(
    "https://${UserPoolDomain}.auth.${AWS::Region}.amazoncognito.com",
  ),
  BEDROCK_MODEL_ID: ref("BedrockModelId"),
  BEDROCK_KNOWLEDGE_BASE_ID: iff("KnowledgeEnabled", ref("KnowledgeBase"), ""),
  BEDROCK_DATA_SOURCE_ID: iff(
    "KnowledgeEnabled",
    att("KnowledgeDataSource", "DataSourceId"),
    "",
  ),
  SES_FROM_EMAIL: ref("SenderEmail"),
  AZURE_SPEECH_SECRET_ARN: ref("VietnameseSpeechSecretArn"),
};
const dataPolicy = allow(
  [
    "dynamodb:GetItem",
    "dynamodb:PutItem",
    "dynamodb:UpdateItem",
    "dynamodb:DeleteItem",
    "dynamodb:Query",
    "dynamodb:TransactWriteItems",
  ],
  att("LibraryTable", "Arn"),
);
const filePolicy = allow(
  ["s3:GetObject", "s3:PutObject"],
  sub("${ContentBucket.Arn}/*"),
);
const bedrockPolicy = iff(
  "ModelEnabled",
  allow(
    ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
    ref("BedrockModelArn"),
  ),
);
const knowledgePolicy = iff(
  "KnowledgeEnabled",
  allow(
    [
      "bedrock:Retrieve",
      "bedrock:StartIngestionJob",
      "bedrock:GetIngestionJob",
    ],
    att("KnowledgeBase", "KnowledgeBaseArn"),
  ),
);
const emailPolicy = iff(
  "EmailEnabled",
  allow(
    "ses:SendEmail",
    sub(
      "arn:${AWS::Partition}:ses:${AWS::Region}:${AWS::AccountId}:identity/${SenderEmail}",
    ),
  ),
);
const voicePolicy = iff(
  "VietnameseSpeechEnabled",
  allow("secretsmanager:GetSecretValue", ref("VietnameseSpeechSecretArn")),
);
const resources = {
  LibraryTable: {
    Type: "AWS::DynamoDB::Table",
    DeletionPolicy: "Retain",
    UpdateReplacePolicy: "Retain",
    Properties: {
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      SSESpecification: { SSEEnabled: true },
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
    },
  },
  FrontendBucket: bucket(),
  ContentBucket: bucket(),
  FrontendOAC: {
    Type: "AWS::CloudFront::OriginAccessControl",
    Properties: {
      OriginAccessControlConfig: {
        Name: sub("${AWS::StackName}-frontend"),
        OriginAccessControlOriginType: "s3",
        SigningBehavior: "always",
        SigningProtocol: "sigv4",
      },
    },
  },
  Distribution: {
    Type: "AWS::CloudFront::Distribution",
    Properties: {
      DistributionConfig: {
        Enabled: true,
        DefaultRootObject: "index.html",
        HttpVersion: "http2and3",
        PriceClass: "PriceClass_200",
        Origins: [
          {
            Id: "frontend",
            DomainName: att("FrontendBucket", "RegionalDomainName"),
            OriginAccessControlId: ref("FrontendOAC"),
            S3OriginConfig: { OriginAccessIdentity: "" },
          },
          {
            Id: "api",
            DomainName: sub(
              "${LibraryApi}.execute-api.${AWS::Region}.amazonaws.com",
            ),
            CustomOriginConfig: {
              OriginProtocolPolicy: "https-only",
              HTTPSPort: 443,
              OriginSSLProtocols: ["TLSv1.2"],
            },
          },
        ],
        DefaultCacheBehavior: {
          TargetOriginId: "frontend",
          ViewerProtocolPolicy: "redirect-to-https",
          AllowedMethods: ["GET", "HEAD", "OPTIONS"],
          CachedMethods: ["GET", "HEAD"],
          Compress: true,
          CachePolicyId: ref("StaticCachePolicy"),
        },
        CacheBehaviors: [
          {
            PathPattern: "/api/*",
            TargetOriginId: "api",
            ViewerProtocolPolicy: "https-only",
            AllowedMethods: [
              "GET",
              "HEAD",
              "OPTIONS",
              "PUT",
              "PATCH",
              "POST",
              "DELETE",
            ],
            CachedMethods: ["GET", "HEAD"],
            CachePolicyId: ref("ApiCachePolicy"),
            OriginRequestPolicyId: ref("ApiOriginPolicy"),
          },
        ],
        CustomErrorResponses: [
          {
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: "/index.html",
            ErrorCachingMinTTL: 0,
          },
          {
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: "/index.html",
            ErrorCachingMinTTL: 0,
          },
        ],
        ViewerCertificate: {
          CloudFrontDefaultCertificate: true,
          MinimumProtocolVersion: "TLSv1.2_2021",
        },
      },
    },
  },
  StaticCachePolicy: {
    Type: "AWS::CloudFront::CachePolicy",
    Properties: {
      CachePolicyConfig: {
        Name: sub("${AWS::StackName}-static"),
        DefaultTTL: 300,
        MinTTL: 0,
        MaxTTL: 86400,
        ParametersInCacheKeyAndForwardedToOrigin: {
          EnableAcceptEncodingGzip: true,
          EnableAcceptEncodingBrotli: true,
          CookiesConfig: { CookieBehavior: "none" },
          HeadersConfig: { HeaderBehavior: "none" },
          QueryStringsConfig: { QueryStringBehavior: "none" },
        },
      },
    },
  },
  ApiCachePolicy: {
    Type: "AWS::CloudFront::CachePolicy",
    Properties: {
      CachePolicyConfig: {
        Name: sub("${AWS::StackName}-api-no-cache"),
        DefaultTTL: 0,
        MinTTL: 0,
        MaxTTL: 0,
        ParametersInCacheKeyAndForwardedToOrigin: {
          EnableAcceptEncodingGzip: false,
          CookiesConfig: { CookieBehavior: "none" },
          HeadersConfig: { HeaderBehavior: "none" },
          QueryStringsConfig: { QueryStringBehavior: "none" },
        },
      },
    },
  },
  ApiOriginPolicy: {
    Type: "AWS::CloudFront::OriginRequestPolicy",
    Properties: {
      OriginRequestPolicyConfig: {
        Name: sub("${AWS::StackName}-api-forward"),
        HeadersConfig: { HeaderBehavior: "allExcept", Headers: ["host"] },
        CookiesConfig: { CookieBehavior: "all" },
        QueryStringsConfig: { QueryStringBehavior: "all" },
      },
    },
  },
  FrontendPolicy: {
    Type: "AWS::S3::BucketPolicy",
    Properties: {
      Bucket: ref("FrontendBucket"),
      PolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          allow("s3:GetObject", sub("${FrontendBucket.Arn}/*"), {
            Principal: { Service: "cloudfront.amazonaws.com" },
            Condition: {
              StringEquals: {
                "AWS:SourceArn": sub(
                  "arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${Distribution}",
                ),
              },
            },
          }),
        ],
      },
    },
  },
  ContentTlsPolicy: {
    Type: "AWS::S3::BucketPolicy",
    Properties: {
      Bucket: ref("ContentBucket"),
      PolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Deny",
            Principal: "*",
            Action: "s3:*",
            Resource: [
              att("ContentBucket", "Arn"),
              sub("${ContentBucket.Arn}/*"),
            ],
            Condition: { Bool: { "aws:SecureTransport": "false" } },
          },
        ],
      },
    },
  },
  UserPool: {
    Type: "AWS::Cognito::UserPool",
    DeletionPolicy: "Retain",
    UpdateReplacePolicy: "Retain",
    Properties: {
      UserPoolName: sub("${AWS::StackName}-users"),
      UsernameAttributes: ["email"],
      AutoVerifiedAttributes: ["email"],
      AccountRecoverySetting: {
        RecoveryMechanisms: [{ Name: "verified_email", Priority: 1 }],
      },
      Policies: {
        PasswordPolicy: {
          MinimumLength: 10,
          RequireLowercase: true,
          RequireUppercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        },
      },
      Schema: [
        {
          Name: "email",
          AttributeDataType: "String",
          Required: true,
          Mutable: true,
        },
        { Name: "name", AttributeDataType: "String", Mutable: true },
      ],
    },
  },
  UserPoolClient: {
    Type: "AWS::Cognito::UserPoolClient",
    Properties: {
      UserPoolId: ref("UserPool"),
      GenerateSecret: false,
      SupportedIdentityProviders: ["COGNITO"],
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ["code"],
      AllowedOAuthScopes: [
        "openid",
        "email",
        "profile",
        "aws.cognito.signin.user.admin",
      ],
      CallbackURLs: [sub("${ApplicationOrigin}/")],
      LogoutURLs: [sub("${ApplicationOrigin}/")],
      ExplicitAuthFlows: [
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_REFRESH_TOKEN_AUTH",
        "ALLOW_USER_SRP_AUTH",
      ],
      PreventUserExistenceErrors: "ENABLED",
      EnableTokenRevocation: true,
      AccessTokenValidity: 60,
      IdTokenValidity: 60,
      RefreshTokenValidity: 30,
      TokenValidityUnits: {
        AccessToken: "minutes",
        IdToken: "minutes",
        RefreshToken: "days",
      },
    },
  },
  ApiLogs: { Type: "AWS::Logs::LogGroup", Properties: { RetentionInDays: 30 } },
  LibraryApi: {
    Type: "AWS::Serverless::HttpApi",
    Properties: {
      StageName: "$default",
      Auth: {
        DefaultAuthorizer: "CognitoJwt",
        Authorizers: {
          CognitoJwt: {
            IdentitySource: "$request.header.Authorization",
            JwtConfiguration: {
              issuer: sub(
                "https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}",
              ),
              audience: [ref("UserPoolClient")],
            },
          },
        },
      },
      CorsConfiguration: {
        AllowOrigins: [ref("ApplicationOrigin")],
        AllowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
        AllowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        AllowCredentials: true,
      },
      DefaultRouteSettings: {
        ThrottlingBurstLimit: 30,
        ThrottlingRateLimit: 20,
      },
      AccessLogSettings: {
        DestinationArn: att("ApiLogs", "Arn"),
        Format:
          '{"requestId":"$context.requestId","status":"$context.status","route":"$context.routeKey","latency":"$context.responseLatency"}',
      },
    },
  },
  ApiFunction: {
    Type: "AWS::Serverless::Function",
    Properties: {
      CodeUri: "../.local/lambda/",
      Handler: "index.handler",
      Runtime: "nodejs24.x",
      Architectures: ["arm64"],
      Timeout: 29,
      MemorySize: 1024,
      Environment: { Variables: environment },
      Policies: [
        {
          Version: "2012-10-17",
          Statement: [
            dataPolicy,
            filePolicy,
            bedrockPolicy,
            knowledgePolicy,
            voicePolicy,
            allow(
              [
                "cognito-idp:AdminCreateUser",
                "cognito-idp:AdminSetUserPassword",
                "cognito-idp:AdminListGroupsForUser",
                "cognito-idp:AdminAddUserToGroup",
                "cognito-idp:AdminRemoveUserFromGroup",
              ],
              att("UserPool", "Arn"),
            ),
            allow(
              "transcribe:StartTranscriptionJob",
              sub(
                "arn:${AWS::Partition}:transcribe:${AWS::Region}:${AWS::AccountId}:transcription-job/cloudlibrary-*",
              ),
            ),
            allow(
              "transcribe:GetTranscriptionJob",
              sub(
                "arn:${AWS::Partition}:transcribe:${AWS::Region}:${AWS::AccountId}:transcription-job/cloudlibrary-*",
              ),
            ),
            allow("polly:SynthesizeSpeech", "*"),
          ],
        },
      ],
      Events: events,
      LoggingConfig: {
        LogFormat: "JSON",
        ApplicationLogLevel: "INFO",
        SystemLogLevel: "INFO",
      },
    },
  },
  ReminderFunction: {
    Type: "AWS::Serverless::Function",
    Properties: {
      CodeUri: "../.local/lambda/",
      Handler: "index.reminders",
      Runtime: "nodejs24.x",
      Architectures: ["arm64"],
      Timeout: 120,
      MemorySize: 512,
      Environment: { Variables: environment },
      Policies: [
        {
          Version: "2012-10-17",
          Statement: [dataPolicy, filePolicy, emailPolicy],
        },
      ],
    },
  },
  AudioFunction: {
    Type: "AWS::Serverless::Function",
    Properties: {
      CodeUri: "../.local/lambda/",
      Handler: "index.audioWorker",
      Runtime: "nodejs24.x",
      Architectures: ["arm64"],
      Timeout: 120,
      MemorySize: 1024,
      Environment: { Variables: environment },
      Policies: [
        {
          Version: "2012-10-17",
          Statement: [
            dataPolicy,
            filePolicy,
            bedrockPolicy,
            knowledgePolicy,
            voicePolicy,
            allow(
              "transcribe:GetTranscriptionJob",
              sub(
                "arn:${AWS::Partition}:transcribe:${AWS::Region}:${AWS::AccountId}:transcription-job/cloudlibrary-*",
              ),
            ),
            allow("polly:SynthesizeSpeech", "*"),
          ],
        },
      ],
      Events: {
        RecoverAudio: {
          Type: "Schedule",
          Properties: {
            Schedule: "rate(5 minutes)",
            Description:
              "Recover an unfinished audio job after missed events or an expired worker lease.",
          },
        },
        TranscriptionEvent: {
          Type: "EventBridgeRule",
          Properties: {
            Pattern: {
              source: ["aws.transcribe"],
              "detail-type": ["Transcribe Job State Change"],
              detail: {
                TranscriptionJobStatus: ["COMPLETED", "FAILED"],
                TranscriptionJobName: [{ prefix: "cloudlibrary-" }],
              },
            },
          },
        },
      },
    },
  },
  BootstrapFunction: {
    Type: "AWS::Serverless::Function",
    Properties: {
      CodeUri: "../.local/lambda/",
      Handler: "index.initialize",
      Runtime: "nodejs24.x",
      Architectures: ["arm64"],
      Timeout: 120,
      MemorySize: 512,
      Environment: { Variables: environment },
      Policies: [
        { Version: "2012-10-17", Statement: [dataPolicy, filePolicy] },
      ],
    },
  },
  SchedulerRole: {
    Type: "AWS::IAM::Role",
    Properties: {
      AssumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { Service: "scheduler.amazonaws.com" },
          },
        ],
      },
      Policies: [
        {
          PolicyName: "invoke-reminders",
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              allow("lambda:InvokeFunction", att("ReminderFunction", "Arn")),
            ],
          },
        },
      ],
    },
  },
  ReminderSchedule: {
    Type: "AWS::Scheduler::Schedule",
    Properties: {
      ScheduleExpression: "cron(0/15 * * * ? *)",
      ScheduleExpressionTimezone: "Asia/Ho_Chi_Minh",
      FlexibleTimeWindow: { Mode: "OFF" },
      Target: {
        Arn: att("ReminderFunction", "Arn"),
        RoleArn: att("SchedulerRole", "Arn"),
        Input: "{}",
        RetryPolicy: { MaximumEventAgeInSeconds: 900, MaximumRetryAttempts: 2 },
      },
    },
  },
  ApiErrorsAlarm: {
    Type: "AWS::CloudWatch::Alarm",
    Properties: {
      AlarmDescription: "Cloud Library API Lambda errors",
      Namespace: "AWS/Lambda",
      MetricName: "Errors",
      Dimensions: [{ Name: "FunctionName", Value: ref("ApiFunction") }],
      Statistic: "Sum",
      Period: 300,
      EvaluationPeriods: 1,
      Threshold: 3,
      ComparisonOperator: "GreaterThanOrEqualToThreshold",
      TreatMissingData: "notBreaching",
    },
  },
  VectorBucket: {
    Type: "AWS::S3Vectors::VectorBucket",
    Condition: "KnowledgeEnabled",
    DeletionPolicy: "Retain",
    UpdateReplacePolicy: "Retain",
    Properties: {},
  },
  VectorIndex: {
    Type: "AWS::S3Vectors::Index",
    Condition: "KnowledgeEnabled",
    DeletionPolicy: "Retain",
    UpdateReplacePolicy: "Retain",
    Properties: {
      VectorBucketArn: ref("VectorBucket"),
      IndexName: "cloud-library-knowledge",
      DataType: "float32",
      Dimension: 1024,
      DistanceMetric: "cosine",
      MetadataConfiguration: {
        NonFilterableMetadataKeys: [
          "AMAZON_BEDROCK_TEXT",
          "AMAZON_BEDROCK_METADATA",
        ],
      },
    },
  },
  KnowledgeRole: {
    Type: "AWS::IAM::Role",
    Condition: "KnowledgeEnabled",
    Properties: {
      AssumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { Service: "bedrock.amazonaws.com" },
            Condition: {
              StringEquals: { "aws:SourceAccount": ref("AWS::AccountId") },
              ArnLike: {
                "aws:SourceArn": sub(
                  "arn:${AWS::Partition}:bedrock:${AWS::Region}:${AWS::AccountId}:knowledge-base/*",
                ),
              },
            },
          },
        ],
      },
      Policies: [
        {
          PolicyName: "knowledge-resources",
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              allow("s3:ListBucket", att("ContentBucket", "Arn"), {
                Condition: { StringLike: { "s3:prefix": ["knowledge/*"] } },
              }),
              allow("s3:GetObject", sub("${ContentBucket.Arn}/knowledge/*")),
              allow(
                "bedrock:InvokeModel",
                sub(
                  "arn:${AWS::Partition}:bedrock:${AWS::Region}::foundation-model/amazon.titan-embed-text-v2:0",
                ),
              ),
              allow(
                [
                  "s3vectors:GetIndex",
                  "s3vectors:PutVectors",
                  "s3vectors:GetVectors",
                  "s3vectors:DeleteVectors",
                  "s3vectors:QueryVectors",
                  "s3vectors:ListVectors",
                ],
                ref("VectorIndex"),
              ),
            ],
          },
        },
      ],
    },
  },
  KnowledgeBase: {
    Type: "AWS::Bedrock::KnowledgeBase",
    Condition: "KnowledgeEnabled",
    Properties: {
      Name: sub("${AWS::StackName}-knowledge"),
      RoleArn: att("KnowledgeRole", "Arn"),
      KnowledgeBaseConfiguration: {
        Type: "VECTOR",
        VectorKnowledgeBaseConfiguration: {
          EmbeddingModelArn: sub(
            "arn:${AWS::Partition}:bedrock:${AWS::Region}::foundation-model/amazon.titan-embed-text-v2:0",
          ),
          EmbeddingModelConfiguration: {
            BedrockEmbeddingModelConfiguration: { Dimensions: 1024 },
          },
        },
      },
      StorageConfiguration: {
        Type: "S3_VECTORS",
        S3VectorsConfiguration: { IndexArn: ref("VectorIndex") },
      },
    },
  },
  KnowledgeDataSource: {
    Type: "AWS::Bedrock::DataSource",
    Condition: "KnowledgeEnabled",
    Properties: {
      KnowledgeBaseId: ref("KnowledgeBase"),
      Name: "approved-library-sources",
      DataSourceConfiguration: {
        Type: "S3",
        S3Configuration: {
          BucketArn: att("ContentBucket", "Arn"),
          InclusionPrefixes: ["knowledge/"],
        },
      },
      VectorIngestionConfiguration: {
        ChunkingConfiguration: {
          ChunkingStrategy: "FIXED_SIZE",
          FixedSizeChunkingConfiguration: {
            MaxTokens: 400,
            OverlapPercentage: 15,
          },
        },
      },
      DataDeletionPolicy: "DELETE",
    },
  },
};
resources.UserPoolDomain = {
  Type: "AWS::Cognito::UserPoolDomain",
  Properties: {
    Domain: sub("${AWS::StackName}-${AWS::AccountId}"),
    UserPoolId: ref("UserPool"),
  },
};
for (const role of ["reader", "author", "librarian", "admin"])
  resources[role + "Group"] = {
    Type: "AWS::Cognito::UserPoolGroup",
    Properties: {
      UserPoolId: ref("UserPool"),
      GroupName: role,
      Description: "Cloud Library " + role,
    },
  };
resources.ContentBucket.Properties.CorsConfiguration = {
  CorsRules: [
    {
      AllowedHeaders: ["*"],
      AllowedMethods: ["GET", "HEAD", "PUT"],
      AllowedOrigins: [ref("ApplicationOrigin")],
      ExposedHeaders: ["ETag", "Content-Range", "Accept-Ranges"],
      MaxAge: 300,
    },
  ],
};
resources.ContentBucket.Properties.LifecycleConfiguration = {
  Rules: [
    {
      Id: "abort-incomplete-uploads",
      Status: "Enabled",
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    },
    {
      Id: "expire-audio-input",
      Status: "Enabled",
      Prefix: "audio/input/",
      ExpirationInDays: 7,
    },
  ],
};
resources.KnowledgeSyncFunction = {
  Type: "AWS::Serverless::Function",
  Condition: "KnowledgeEnabled",
  Properties: {
    CodeUri: "../.local/lambda/",
    Handler: "index.knowledgeSync",
    Runtime: "nodejs24.x",
    Architectures: ["arm64"],
    Timeout: 120,
    MemorySize: 512,
    Environment: { Variables: environment },
    Policies: [
      {
        Version: "2012-10-17",
        Statement: [
          dataPolicy,
          filePolicy,
          knowledgePolicy,
          allow("s3:DeleteObject", sub("${ContentBucket.Arn}/knowledge/*")),
        ],
      },
    ],
  },
};
resources.KnowledgeSchedule = {
  Type: "AWS::Scheduler::Schedule",
  Condition: "KnowledgeEnabled",
  Properties: {
    ScheduleExpression: "rate(15 minutes)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: att("KnowledgeSyncFunction", "Arn"),
      RoleArn: att("SchedulerRole", "Arn"),
      Input: "{}",
      RetryPolicy: { MaximumEventAgeInSeconds: 900, MaximumRetryAttempts: 2 },
    },
  },
};
resources.SchedulerRole.Properties.Policies[0].PolicyDocument.Statement.push(
  iff(
    "KnowledgeEnabled",
    allow("lambda:InvokeFunction", att("KnowledgeSyncFunction", "Arn")),
  ),
);
for (const name of [
  "ApiFunction",
  "ReminderFunction",
  "AudioFunction",
  "BootstrapFunction",
  "KnowledgeSyncFunction",
])
  resources[name + "Logs"] = {
    Type: "AWS::Logs::LogGroup",
    ...(name === "KnowledgeSyncFunction"
      ? { Condition: "KnowledgeEnabled" }
      : {}),
    Properties: {
      LogGroupName: sub(`/aws/lambda/\${${name}}`),
      RetentionInDays: 30,
    },
  };
// Rewrite SPA paths only for the static origin, preserving real API error status codes.
resources.SpaRouter = {
  Type: "AWS::CloudFront::Function",
  Properties: {
    Name: sub("${AWS::StackName}-spa-router"),
    AutoPublish: true,
    FunctionConfig: {
      Comment: "Cloud Library SPA route handling",
      Runtime: "cloudfront-js-2.0",
    },
    FunctionCode:
      'function handler(event) { var request = event.request; if (!request.uri.startsWith("/api/") && !request.uri.split("/").pop().includes(".")) request.uri = "/index.html"; return request; }',
  },
};
resources.Distribution.Properties.DistributionConfig.DefaultCacheBehavior.FunctionAssociations =
  [
    {
      EventType: "viewer-request",
      FunctionARN: att("SpaRouter", "FunctionARN"),
    },
  ];
delete resources.Distribution.Properties.DistributionConfig
  .CustomErrorResponses;

export const template = {
  AWSTemplateFormatVersion: "2010-09-09",
  Transform: "AWS::Serverless-2016-10-31",
  Description:
    "Cloud Library: DynamoDB, Cognito, private S3/CloudFront, Lambda HTTP API, Bedrock, reminders and audio.",
  Parameters: {
    ApplicationOrigin: {
      Type: "String",
      Default: "https://example.invalid",
      Description:
        "Set to the CloudFront HTTPS origin after initial infrastructure creation.",
    },
    BedrockModelId: {
      Type: "String",
      Default: "",
      Description:
        "A tested Converse model ID or inference profile in the selected region.",
    },
    BedrockModelArn: {
      Type: "String",
      Default: "",
      Description:
        "IAM ARN for the selected model/inference profile; verify regional invocation permissions.",
    },
    EnableKnowledgeBase: {
      Type: "String",
      Default: "false",
      AllowedValues: ["true", "false"],
    },
    SenderEmail: {
      Type: "String",
      Default: "",
      Description: "An SES-verified sender email address.",
    },
    VietnameseSpeechSecretArn: {
      Type: "String",
      Default: "",
      Description:
        "Optional Secrets Manager ARN containing Azure Speech key and region.",
    },
  },
  Conditions: {
    KnowledgeEnabled: { "Fn::Equals": [ref("EnableKnowledgeBase"), "true"] },
    ModelEnabled: {
      "Fn::Not": [{ "Fn::Equals": [ref("BedrockModelId"), ""] }],
    },
    EmailEnabled: { "Fn::Not": [{ "Fn::Equals": [ref("SenderEmail"), ""] }] },
    VietnameseSpeechEnabled: {
      "Fn::Not": [{ "Fn::Equals": [ref("VietnameseSpeechSecretArn"), ""] }],
    },
  },
  Resources: resources,
  Outputs: {
    WebsiteUrl: { Value: sub("https://${Distribution.DomainName}") },
    ApiUrl: {
      Value: sub(
        "https://${LibraryApi}.execute-api.${AWS::Region}.amazonaws.com",
      ),
    },
    FrontendBucketName: { Value: ref("FrontendBucket") },
    ContentBucketName: { Value: ref("ContentBucket") },
    TableName: { Value: ref("LibraryTable") },
    UserPoolId: { Value: ref("UserPool") },
    UserPoolClientId: { Value: ref("UserPoolClient") },
    CognitoDomain: {
      Value: sub(
        "https://${UserPoolDomain}.auth.${AWS::Region}.amazoncognito.com",
      ),
    },
    DistributionId: { Value: ref("Distribution") },
    BootstrapFunctionName: { Value: ref("BootstrapFunction") },
    KnowledgeSyncFunctionName: {
      Condition: "KnowledgeEnabled",
      Value: ref("KnowledgeSyncFunction"),
    },
    KnowledgeBaseId: {
      Condition: "KnowledgeEnabled",
      Value: ref("KnowledgeBase"),
    },
  },
};
await mkdir("infra", { recursive: true });
await writeFile(
  "infra/template.json",
  JSON.stringify(template, null, 2) + "\n",
);
console.log(
  `Prepared ${Object.keys(resources).length} AWS resource definitions; no cloud resources created.`,
);
