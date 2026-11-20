// lib/shopify-webhooks.ts
import { shopifyGraphQLFetch } from "./shopifyGraphQLFetch";

export async function RegisterOrderWebhook(shop: string, accessToken: string) {
  const appUrl = process.env.SHOPIFY_APP_URL?.replace(/\/$/, "");
  if (!appUrl) {
    console.warn("SHOPIFY_APP_URL is not set. Skipping webhook registration.");
    return null;
  }

  const callbackUrl = `${appUrl}/api/webhooks/orders`;

  const mutation = `
    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        userErrors {
          field
          message
        }
        webhookSubscription {
          id
          topic
          endpoint {
            __typename
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
      }
    }
  `;

  const variables = {
    topic: "ORDERS_CREATE",
    webhookSubscription: {
      callbackUrl,
      format: "JSON",
    },
  };

  try {
    const result = await shopifyGraphQLFetch(shop, accessToken, mutation, variables);
    const userErrors = result?.data?.webhookSubscriptionCreate?.userErrors;
    if (userErrors && userErrors.length > 0) {
      console.warn("Webhook registration notice:", userErrors);
    } else {
      console.log(`Order webhook registered successfully for ${shop}`);
    }
    return result;
  } catch (error) {
    console.error("Failed to register order webhook:", error);
    return null;
  }
}
