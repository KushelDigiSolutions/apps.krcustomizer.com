// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaInstance: PrismaClient | undefined;
}

const prisma = (globalThis as any).prismaInstance || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  (globalThis as any).prismaInstance = prisma;
}

export default prisma;
