import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

// Create D1 HTTP adapter for production
function createD1Adapter() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_DATABASE_ID;
  const token = process.env.CLOUDFLARE_D1_TOKEN;

  if (!accountId || !databaseId || !token) {
    throw new Error(
      "Missing Cloudflare D1 credentials: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID, and CLOUDFLARE_D1_TOKEN are required",
    );
  }

  console.log("Using Cloudflare D1 with account ID:", accountId);

  // Use the HTTP parameters approach for D1
  return new PrismaD1({
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_DATABASE_ID: databaseId,
    CLOUDFLARE_D1_TOKEN: token,
  });
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient({
      log: ["query"],
    });
  }
}

const prisma =
  global.prismaGlobal ??
  new PrismaClient({
    adapter: createD1Adapter(),
    log: [],
  });

export default prisma;
