import { z } from "zod";

/**
 * The fixed dietary / allergen / category taxonomy from PRD §9.
 *
 * This is deliberately a closed set shared by the post form and (from step 7)
 * the AI classifier's tool schema, so the model cannot invent tags at runtime.
 * To add a tag, update PRD §9 first, then this file.
 *
 * Allergen tags are never authoritative — they are shown as user-confirmed
 * information, and the UI must not present them as a safety guarantee.
 */

export const DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "gluten-free",
  "dairy-free",
  "nut-free",
] as const;

export const ALLERGEN_TAGS = [
  "contains-nuts",
  "contains-dairy",
  "contains-gluten",
  "contains-shellfish",
  "contains-eggs",
  "contains-soy",
] as const;

export const CATEGORY_TAGS = [
  "meal",
  "snacks",
  "baked-goods",
  "beverages",
  "produce",
  "other",
] as const;

export const ALL_TAGS = [
  ...DIETARY_TAGS,
  ...ALLERGEN_TAGS,
  ...CATEGORY_TAGS,
] as const;

export type Tag = (typeof ALL_TAGS)[number];

export const tagSchema = z.enum(ALL_TAGS);

/** Human-readable labels for the UI. Keys must cover every tag in ALL_TAGS. */
export const TAG_LABELS: Record<Tag, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  halal: "Halal",
  kosher: "Kosher",
  "gluten-free": "Gluten-free",
  "dairy-free": "Dairy-free",
  "nut-free": "Nut-free",
  "contains-nuts": "Contains nuts",
  "contains-dairy": "Contains dairy",
  "contains-gluten": "Contains gluten",
  "contains-shellfish": "Contains shellfish",
  "contains-eggs": "Contains eggs",
  "contains-soy": "Contains soy",
  meal: "Meal",
  snacks: "Snacks",
  "baked-goods": "Baked goods",
  beverages: "Beverages",
  produce: "Produce",
  other: "Other",
};

export const TAG_GROUPS = [
  { label: "Dietary", tags: DIETARY_TAGS },
  { label: "Contains", tags: ALLERGEN_TAGS },
  { label: "Category", tags: CATEGORY_TAGS },
] as const;
