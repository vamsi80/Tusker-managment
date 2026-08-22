export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const GSTIN_CHARACTERS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface GstinAddressDetails {
  building_number: string | null;
  building_name: string | null;
  floor: string | null;
  street: string | null;
  locality: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  landmark: string | null;
  pincode: string | null;
}

export interface GstinLookupData {
  gstin: string;
  legal_name: string;
  trade_name: string | null;
  status: string;
  taxpayer_type: string;
  business_constitution: string | null;
  registration_date: string | null;
  cancellation_date: string | null;
  state_code: string;
  state_jurisdiction: string | null;
  address: string | null;
  city: string | null;
  address_details: GstinAddressDetails | null;
  pincode: string | null;
  nature_of_business: string[] | null;
  block_status: string | null;
  einvoice_status?: string | null;
  last_updated?: string | null;
}

export interface VendorFieldsFromGstin {
  name: string;
  companyName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: "India";
}

/**
 * The GST registry record as the vendor form holds it: every value a string so
 * it binds straight to an editable input, "" where the registry has nothing.
 */
export interface VendorGstDetails {
  gstStatus: string;
  taxpayerType: string;
  businessConstitution: string;
  gstRegistrationDate: string;
  gstCancellationDate: string;
  stateJurisdiction: string;
  natureOfBusiness: string;
  blockStatus: string;
  einvoiceStatus: string;
}

export const EMPTY_GST_DETAILS: VendorGstDetails = {
  gstStatus: "",
  taxpayerType: "",
  businessConstitution: "",
  gstRegistrationDate: "",
  gstCancellationDate: "",
  stateJurisdiction: "",
  natureOfBusiness: "",
  blockStatus: "",
  einvoiceStatus: "",
};

export const normalizeGstin = (value: string) => value.trim().toUpperCase();

export const getGstinCheckDigit = (firstFourteenCharacters: string) => {
  const normalized = normalizeGstin(firstFourteenCharacters);
  if (normalized.length !== 14 || !/^[0-9A-Z]+$/.test(normalized)) return null;

  let factor = 1;
  let sum = 0;

  for (const character of normalized) {
    const digit = GSTIN_CHARACTERS.indexOf(character);
    if (digit < 0) return null;

    const product = digit * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 1 ? 2 : 1;
  }

  return GSTIN_CHARACTERS[(36 - (sum % 36)) % 36];
};

export const validateGstin = (value: string) => {
  const gstin = normalizeGstin(value);

  if (!GSTIN_PATTERN.test(gstin)) {
    return { valid: false as const, gstin, error: "Enter a valid 15-character GSTIN." };
  }

  if (getGstinCheckDigit(gstin.slice(0, 14)) !== gstin[14]) {
    return { valid: false as const, gstin, error: "The GSTIN checksum is invalid. Check for typing errors." };
  }

  return { valid: true as const, gstin };
};

/**
 * The first two digits of every GSTIN are the GST state code. The registry
 * never fills `address_details.state` — it is null in every response, and
 * `?include=profile` fills only district and city — so the code is the only
 * reliable source for the state name.
 */
export const GST_STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

/**
 * `city` is the locality as the GST network records it, not a city name — a
 * metro address comes back as "Saidapet, Chennai". The last part is the city
 * often enough to beat leaving the field blank for the user to fill by hand.
 * ponytail: last-segment heuristic; swap for a city list if it misfires.
 */
const cityFromLocality = (value: string | null | undefined) =>
  value?.split(",").pop()?.trim() ?? "";

export const getVendorFieldsFromGstin = (data: GstinLookupData): VendorFieldsFromGstin => {
  const address = data.address_details;
  const addressLine1 = [
    address?.building_number,
    address?.building_name,
    address?.floor,
    address?.street,
  ].filter(Boolean).join(", ");
  const addressLine2 = [address?.locality, address?.landmark].filter(Boolean).join(", ");

  return {
    name: data.trade_name || data.legal_name,
    companyName: data.legal_name,
    addressLine1: addressLine1 || data.address || "",
    addressLine2,
    city: address?.city || cityFromLocality(data.city) || address?.district || "",
    state: address?.state || GST_STATE_NAMES[data.state_code] || "",
    pincode: address?.pincode || data.pincode || "",
    country: "India",
  };
};

/**
 * business_constitution, state_jurisdiction and nature_of_business arrive null
 * unless the lookup asked for ?include=profile, so every field falls back to ""
 * rather than assuming the profile source answered.
 */
export const getGstDetailsFromGstin = (data: GstinLookupData): VendorGstDetails => ({
  gstStatus: data.status || "",
  taxpayerType: data.taxpayer_type || "",
  businessConstitution: data.business_constitution || "",
  gstRegistrationDate: data.registration_date || "",
  gstCancellationDate: data.cancellation_date || "",
  stateJurisdiction: data.state_jurisdiction || "",
  natureOfBusiness: data.nature_of_business?.join(", ") || "",
  blockStatus: data.block_status || "",
  einvoiceStatus: data.einvoice_status || "",
});

/** Reads the stored columns back into the form's all-strings shape. */
export const gstDetailsFromVendor = (
  vendor: Partial<Record<keyof VendorGstDetails, string | null>>,
): VendorGstDetails => {
  const details = { ...EMPTY_GST_DETAILS };
  for (const key of Object.keys(details) as (keyof VendorGstDetails)[]) {
    details[key] = vendor[key] ?? "";
  }
  return details;
};

/**
 * Cleared fields go back as null, not undefined — undefined drops the key from
 * the JSON body and a PATCH would silently keep the old value.
 */
export const gstDetailsPayload = (details: VendorGstDetails) =>
  Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, value.trim() || null]),
  ) as Record<keyof VendorGstDetails, string | null>;

/**
 * Which fields carry a value that came from the GST registry. Those are locked
 * in the form — the registry is the authority on them — while the ones it left
 * blank stay typeable.
 */
export const filledGstFields = (details: VendorGstDetails) =>
  (Object.keys(details) as (keyof VendorGstDetails)[]).filter((key) => details[key].trim() !== "");
