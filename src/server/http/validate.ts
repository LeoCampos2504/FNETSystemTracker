import type { z } from "zod";
import { badRequest } from "./errors";

/** Parses with the given zod schema or throws a 400 ApiError with issue details. */
export function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest("Validation error", result.error.flatten());
  }
  return result.data;
}

/** Turns a URLSearchParams into a plain object (single value per key) for zod parsing. */
export function searchParamsToObject(searchParams: URLSearchParams): Record<string, string> {
  return Object.fromEntries(searchParams.entries());
}
