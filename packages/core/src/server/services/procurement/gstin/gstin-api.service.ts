
import { z } from "zod";
import prisma from "@tusker/db";
import { env } from "../../../../lib/env";
import { AppError } from "../../../../lib/errors/app-error";
import { type GstinLookupData, validateGstin } from "../../../../lib/procurement/gstin";

const GSTIN_API_BASE_URL = "https://www.gstinapi.in";
const GSTIN_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const MAX_ATTEMPTS = 3;
/**
 * The provider gives 100 free lookups a calendar month. Stopping at 75 leaves
 * headroom rather than silently spending paid credits — past it the vendor form
 * still works, the details just get typed in by hand.
 */
const MONTHLY_LOOKUP_BUDGET = 75;

/** UTC month key. The budget's 25-lookup headroom absorbs any IST offset. */
const currentMonthKey = () => new Date().toISOString().slice(0, 7);

const NullableStringSchema = z.string().nullable().optional();

const AddressDetailsSchema = z.object({
  building_number: NullableStringSchema,
  building_name: NullableStringSchema,
  floor: NullableStringSchema,
  street: NullableStringSchema,
  locality: NullableStringSchema,
  district: NullableStringSchema,
  city: NullableStringSchema,
  state: NullableStringSchema,
  landmark: NullableStringSchema,
  pincode: NullableStringSchema,
}).nullable().optional();

const ProviderSuccessSchema = z.object({
  success: z.literal(true),
  credits_remaining: z.number().optional(),
  profile_complete: z.boolean().optional(),
  data: z.object({
    gstin: z.string(),
    legal_name: z.string(),
    trade_name: NullableStringSchema,
    status: z.string(),
    taxpayer_type: z.string(),
    business_constitution: NullableStringSchema,
    registration_date: NullableStringSchema,
    cancellation_date: NullableStringSchema,
    state_code: z.string(),
    state_jurisdiction: NullableStringSchema,
    address: NullableStringSchema,
    city: NullableStringSchema,
    address_details: AddressDetailsSchema,
    pincode: NullableStringSchema,
    nature_of_business: z.array(z.string()).nullable().optional(),
    block_status: NullableStringSchema,
    einvoice_status: NullableStringSchema,
    last_updated: NullableStringSchema,
  }).passthrough(),
}).passthrough();

interface GstinCacheEntry {
  expiresAt: number;
  data: GstinLookupData;
}

const globalGstinCache = globalThis as typeof globalThis & {
  __tuskerGstinCache?: Map<string, GstinCacheEntry>;
};

const gstinCache = globalGstinCache.__tuskerGstinCache ?? new Map<string, GstinCacheEntry>();
globalGstinCache.__tuskerGstinCache = gstinCache;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const readProviderError = async (response: Response) => {
  try {
    const body = await response.json();
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
};

const normalizeProviderData = (
  raw: z.infer<typeof ProviderSuccessSchema>["data"],
): GstinLookupData => ({
  gstin: raw.gstin,
  legal_name: raw.legal_name,
  trade_name: raw.trade_name ?? null,
  status: raw.status,
  taxpayer_type: raw.taxpayer_type,
  business_constitution: raw.business_constitution ?? null,
  registration_date: raw.registration_date ?? null,
  cancellation_date: raw.cancellation_date ?? null,
  state_code: raw.state_code,
  state_jurisdiction: raw.state_jurisdiction ?? null,
  address: raw.address ?? null,
  city: raw.city ?? null,
  address_details: raw.address_details
    ? {
        building_number: raw.address_details.building_number ?? null,
        building_name: raw.address_details.building_name ?? null,
        floor: raw.address_details.floor ?? null,
        street: raw.address_details.street ?? null,
        locality: raw.address_details.locality ?? null,
        district: raw.address_details.district ?? null,
        city: raw.address_details.city ?? null,
        state: raw.address_details.state ?? null,
        landmark: raw.address_details.landmark ?? null,
        pincode: raw.address_details.pincode ?? null,
      }
    : null,
  pincode: raw.pincode ?? null,
  nature_of_business: raw.nature_of_business ?? null,
  block_status: raw.block_status ?? null,
  einvoice_status: raw.einvoice_status ?? null,
  last_updated: raw.last_updated ?? null,
});

const setCachedLookup = (gstin: string, data: GstinLookupData) => {
  if (gstinCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = gstinCache.keys().next().value;
    if (oldestKey) gstinCache.delete(oldestKey);
  }

  gstinCache.set(gstin, {
    data,
    expiresAt: Date.now() + GSTIN_CACHE_TTL_MS,
  });
};

export const lookupGstin = async (input: string) => {
  const validation = validateGstin(input);
  if (!validation.valid) throw AppError.ValidationError(validation.error);

  const cached = gstinCache.get(validation.gstin);
  if (cached && cached.expiresAt > Date.now()) {
    return { data: cached.data, cached: true };
  }
  if (cached) gstinCache.delete(validation.gstin);

  const apiKey = env.GSTIN_API_KEY;
  if (!apiKey) {
    throw AppError.ServiceUnavailable("GSTIN verification is not configured yet.");
  }

  // Checked before the call and incremented after, so a failed lookup — which
  // the provider does not charge for — is not counted either.
  // ponytail: two simultaneous lookups can both pass the check; the headroom
  // covers it. Move to an atomic increment-then-compare if that stops holding.
  const month = currentMonthKey();
  const usage = await prisma.gstinLookupUsage.findUnique({ where: { month } });
  if ((usage?.count ?? 0) >= MONTHLY_LOOKUP_BUDGET) {
    throw AppError.ServiceUnavailable(
      `This month's limit of ${MONTHLY_LOOKUP_BUDGET} GSTIN verifications has been reached. Please enter this supplier / contractor's details manually.`
    );
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(
        `${GSTIN_API_BASE_URL}/v1/gstin/${encodeURIComponent(validation.gstin)}?include=profile`,
        {
          headers: { "x-api-key": apiKey },
          signal: AbortSignal.timeout(10_000),
          cache: "no-store",
        },
      );
    } catch {
      if (attempt < MAX_ATTEMPTS - 1) {
        await wait(250 * 2 ** attempt);
        continue;
      }
      throw AppError.ServiceUnavailable("GSTIN verification service could not be reached.");
    }

    if ((response.status === 429 || response.status === 502) && attempt < MAX_ATTEMPTS - 1) {
      await wait(250 * 2 ** attempt);
      continue;
    }

    if (!response.ok) {
      const providerError = await readProviderError(response);

      if (response.status === 400) {
        throw AppError.ValidationError(providerError || "The GSTIN is invalid.");
      }
      if (response.status === 404) {
        throw AppError.NotFound("This GSTIN was not found in the GST registry.");
      }
      if (response.status === 402) {
        throw AppError.ServiceUnavailable("GSTIN lookup credits are exhausted. Please recharge the API account.");
      }
      if (response.status === 401 || response.status === 403) {
        throw AppError.ServiceUnavailable("GSTIN verification credentials need attention.");
      }
      if (response.status === 429) {
        throw AppError.ServiceUnavailable("GSTIN verification is busy. Please try again shortly.");
      }
      throw AppError.BadGateway("GSTIN verification provider returned an unexpected error.");
    }

    const parsed = ProviderSuccessSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw AppError.BadGateway("GSTIN verification provider returned an invalid response.");
    }

    const data = normalizeProviderData(parsed.data.data);
    setCachedLookup(validation.gstin, data);
    await prisma.gstinLookupUsage.upsert({
      where: { month },
      create: { month, count: 1 },
      update: { count: { increment: 1 } },
    });
    console.info(`[GSTIN_LOOKUP] Verified ${validation.gstin}; credits remaining: ${parsed.data.credits_remaining ?? "unknown"}`);

    return { data, cached: false };
  }

  throw AppError.ServiceUnavailable("GSTIN verification is temporarily unavailable.");
};
