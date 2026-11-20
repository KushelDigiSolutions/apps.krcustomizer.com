// lib/auth.ts
import jwt from "jsonwebtoken";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";

export interface SessionVerificationResult {
  isValid: boolean;
  shop?: string;
  error?: string;
  decoded?: any;
}

/**
 * Validates whether a given domain is a valid Shopify store domain.
 */
export function isValidShopDomain(shop: string | null | undefined): boolean {
  if (!shop || typeof shop !== "string") return false;
  const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
  return shopRegex.test(shop);
}

/**
 * Verifies the Shopify App Bridge Session Token passed in Authorization header.
 * Ensures the token is signed with SHOPIFY_API_SECRET and belongs to the requested shop.
 */
export function verifyShopifySessionToken(
  request: Request,
  expectedShop?: string
): SessionVerificationResult {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { isValid: false, error: "Missing or malformed Authorization header" };
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return { isValid: false, error: "Empty Bearer token" };
    }

    if (!SHOPIFY_API_SECRET) {
      console.error("SHOPIFY_API_SECRET is not configured on server");
      return { isValid: false, error: "Server authentication misconfigured" };
    }

    const decoded = jwt.verify(token, SHOPIFY_API_SECRET, {
      algorithms: ["HS256"],
    }) as any;

    // Shopify session token 'dest' is 'https://<shop>.myshopify.com'
    const dest = decoded.dest || decoded.iss || "";
    const tokenShop = dest.replace(/^https?:\/\//, "").replace(/\/admin$/, "");

    if (!isValidShopDomain(tokenShop)) {
      return { isValid: false, error: "Invalid shop in session token" };
    }

    if (expectedShop && tokenShop.toLowerCase() !== expectedShop.toLowerCase()) {
      return {
        isValid: false,
        error: `Token shop mismatch: token belongs to ${tokenShop}, request is for ${expectedShop}`,
      };
    }

    return { isValid: true, shop: tokenShop, decoded };
  } catch (error: any) {
    return { isValid: false, error: error.message || "Invalid or expired session token" };
  }
}
