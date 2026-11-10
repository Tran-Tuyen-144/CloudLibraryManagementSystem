const { ListTablesCommand } = require("@aws-sdk/client-dynamodb");
const { client } = require("./config/db");

async function checkDatabase() {
  try {
    const result = await client.send(new ListTablesCommand({}));

    console.log("Ket noi DynamoDB Local thanh cong!");
    console.log("Cac bang hien co:", result.TableNames);
  } catch (error) {
    console.error("Khong ket noi duoc DynamoDB Local.");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
}

checkDatabase();