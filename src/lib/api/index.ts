import type { Api } from "@/contracts";
import { mockApi } from "./mock-api";
import { httpApi } from "./http-api";

/**
 * Single entry point the frontend depends on. Controlled by
 * NEXT_PUBLIC_USE_MOCK_API (real data by default; mock requires explicit true). Never import mock-api/http-api directly from UI code.
 */
export const api: Api = process.env.NEXT_PUBLIC_USE_MOCK_API === "true" ? mockApi : httpApi;

export type { Api } from "@/contracts";
