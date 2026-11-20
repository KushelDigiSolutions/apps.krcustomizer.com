// lib/product/metafields.ts
import { shopifyGraphQLFetch } from "../shopifyGraphQLFetch";

export async function AddMetafieldProduct(shop: string, accessToken: string) {
  const mutation = `
    mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
          name
          namespace
          key
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const variables = {
    definition: {
      name: "KR Customizer Config",
      namespace: "custom",
      key: "krcConfig",
      description: "Controls KR Customizer enablement for products",
      type: "single_line_text_field",
      ownerType: "PRODUCT",
    },
  };

  try {
    const result = await shopifyGraphQLFetch(shop, accessToken, mutation, variables);
    return result;
  } catch (error) {
    console.error("Failed to create metafield definition:", error);
    return null;
  }
}
