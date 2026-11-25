import { createRepository } from "../server/repository.mjs";
import { seedRepository } from "../server/seed.mjs";
const repo = createRepository();
try {
  await repo.initialize();
  await seedRepository(repo);
  console.log("Dữ liệu ban đầu đã sẵn sàng.");
} finally {
  repo.client.destroy();
}
