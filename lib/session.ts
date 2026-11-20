// lib/session.ts
import prisma from "./prisma";

export async function getValidSession(shop: string) {
  if (!shop || typeof shop !== "string") {
    return null;
  }

  try {
    const session = await prisma.session.findUnique({
      where: { shop },
    });
    return session;
  } catch (error) {
    console.error(`Failed to get session for shop ${shop}:`, error);
    return null;
  }
}
