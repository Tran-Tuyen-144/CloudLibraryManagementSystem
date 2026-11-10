const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
} = require("@aws-sdk/lib-dynamodb");

// Cấu hình dành riêng cho database chạy trên máy.
const client = new DynamoDBClient({
  region: "ap-southeast-1",
  endpoint: "http://127.0.0.1:8001",
  credentials: {
    accessKeyId: "localdev",
    secretAccessKey: "localdev",
  },
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

module.exports = { client, docClient };