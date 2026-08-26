import { describe, expect, it } from "vitest";
import {
  filledGstFields,
  getGstDetailsFromGstin,
  getGstinCheckDigit,
  getVendorFieldsFromGstin,
  gstDetailsFromVendor,
  gstDetailsPayload,
  normalizeGstin,
  validateGstin,
} from "../gstin";
import type { GstinLookupData } from "../gstin";

describe("GSTIN validation", () => {
  it("normalizes lowercase input", () => {
    expect(normalizeGstin(" 27aapfu0939f1zv ")).toBe("27AAPFU0939F1ZV");
  });

  it("calculates the official base-36 check digit", () => {
    expect(getGstinCheckDigit("27AAPFU0939F1Z")).toBe("V");
    expect(getGstinCheckDigit("33AAACC1206D1Z")).toBe("N");
  });

  it("accepts a valid GSTIN", () => {
    expect(validateGstin("27AAPFU0939F1ZV")).toEqual({
      valid: true,
      gstin: "27AAPFU0939F1ZV",
    });
  });

  it("rejects invalid formats and check digits", () => {
    expect(validateGstin("27AAPFU0939F1Z1").valid).toBe(false);
    expect(validateGstin("not-a-gstin").valid).toBe(false);
  });

  it("maps structured registry data into vendor fields", () => {
    expect(getVendorFieldsFromGstin({
      gstin: "27AAPFU0939F1ZV",
      legal_name: "EXAMPLE PRIVATE LIMITED",
      trade_name: "EXAMPLE TRADERS",
      status: "Active",
      taxpayer_type: "Regular",
      business_constitution: null,
      registration_date: null,
      cancellation_date: null,
      state_code: "27",
      state_jurisdiction: null,
      address: "12 Market Road, Pune",
      city: "Pune",
      address_details: {
        building_number: "12",
        building_name: null,
        floor: null,
        street: "Market Road",
        locality: "Camp",
        district: "Pune",
        city: "Pune",
        state: "Maharashtra",
        landmark: null,
        pincode: "411001",
      },
      pincode: "411001",
      nature_of_business: null,
      block_status: "Unblocked",
    })).toMatchObject({
      name: "EXAMPLE TRADERS",
      companyName: "EXAMPLE PRIVATE LIMITED",
      addressLine1: "12, Market Road",
      addressLine2: "Camp",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411001",
      country: "India",
    });
  });
  // Both cases below are the worked examples from the gstinapi.in docs.
  it("derives the state from the GSTIN's state code, which the registry never fills", () => {
    expect(getVendorFieldsFromGstin({
      gstin: "33AAACC1206D1ZN",
      legal_name: "CENTRAL WAREHOUSING CORPORATION",
      trade_name: "CENTRAL WAREHOUSING CORPORATION",
      status: "Active",
      taxpayer_type: "Regular",
      business_constitution: null,
      registration_date: "2017-07-01",
      cancellation_date: null,
      state_code: "33",
      state_jurisdiction: null,
      address: "No.4, Thiruvalar Illam, North Avenue, Srinagar Colony, Saidapet, Chennai",
      city: "Saidapet, Chennai",
      address_details: {
        building_number: "No.4",
        building_name: "Thiruvalar Illam",
        floor: null,
        street: "North Avenue",
        locality: "Srinagar Colony, Saidapet, Chennai",
        district: null,
        city: null,
        state: null,
        landmark: null,
        pincode: "600015",
      },
      pincode: "600015",
      nature_of_business: null,
      block_status: "Unblocked",
    })).toMatchObject({
      addressLine1: "No.4, Thiruvalar Illam, North Avenue",
      // "Saidapet, Chennai" is a locality, not a city name.
      city: "Chennai",
      state: "Tamil Nadu",
      pincode: "600015",
    });
  });

  it("leaves a single-part city untouched", () => {
    expect(getVendorFieldsFromGstin({
      gstin: "22AAAAA0000A1Z5",
      legal_name: "EXAMPLE PRIVATE LIMITED",
      trade_name: "EXAMPLE PVT LTD",
      status: "Active",
      taxpayer_type: "Regular",
      business_constitution: null,
      registration_date: "2017-07-01",
      cancellation_date: null,
      state_code: "22",
      state_jurisdiction: null,
      address: "SHOP NO. 12, 1ST FLOOR, 123 BUSINESS PARK, RAIPUR",
      city: "RAIPUR",
      address_details: {
        building_number: "SHOP NO. 12",
        building_name: "123 BUSINESS PARK",
        floor: "1ST FLOOR",
        street: null,
        locality: "RAIPUR",
        district: null,
        city: null,
        state: null,
        landmark: null,
        pincode: "492001",
      },
      pincode: "492001",
      nature_of_business: null,
      block_status: "Unblocked",
    })).toMatchObject({
      name: "EXAMPLE PVT LTD",
      city: "RAIPUR",
      state: "Chhattisgarh",
    });
  });
});

describe("GST registry details", () => {
  const lookup = {
    gstin: "33AAACC1206D1ZN",
    legal_name: "CENTRAL WAREHOUSING CORPORATION",
    trade_name: null,
    status: "Active",
    taxpayer_type: "Regular",
    business_constitution: "Government Department",
    registration_date: "2017-07-01",
    cancellation_date: null,
    state_code: "33",
    state_jurisdiction: "Ward 401",
    address: null,
    city: null,
    address_details: null,
    pincode: null,
    nature_of_business: ["Wholesale Business", "Retail Business"],
    block_status: "Unblocked",
    einvoice_status: "Yes",
  } satisfies GstinLookupData;

  it("maps the registry record into editable strings", () => {
    expect(getGstDetailsFromGstin(lookup)).toEqual({
      gstStatus: "Active",
      taxpayerType: "Regular",
      businessConstitution: "Government Department",
      gstRegistrationDate: "2017-07-01",
      gstCancellationDate: "",
      stateJurisdiction: "Ward 401",
      natureOfBusiness: "Wholesale Business, Retail Business",
      blockStatus: "Unblocked",
      einvoiceStatus: "Yes",
    });
  });

  it("blanks the fields a basic lookup leaves null", () => {
    expect(getGstDetailsFromGstin({
      ...lookup,
      business_constitution: null,
      state_jurisdiction: null,
      nature_of_business: null,
    })).toMatchObject({
      businessConstitution: "",
      stateJurisdiction: "",
      natureOfBusiness: "",
      gstStatus: "Active",
    });
  });

  it("sends a cleared field as null so the column is actually cleared", () => {
    const payload = gstDetailsPayload({ ...getGstDetailsFromGstin(lookup), stateJurisdiction: "   " });
    expect(payload.stateJurisdiction).toBeNull();
    expect(payload.gstCancellationDate).toBeNull();
    expect(payload.gstStatus).toBe("Active");
  });

  it("locks only the fields the registry actually answered", () => {
    expect(filledGstFields(getGstDetailsFromGstin(lookup))).toEqual([
      "gstStatus",
      "taxpayerType",
      "businessConstitution",
      "gstRegistrationDate",
      "stateJurisdiction",
      "natureOfBusiness",
      "blockStatus",
      "einvoiceStatus",
    ]);
  });

  it("leaves a field the registry had nothing for editable", () => {
    const details = getGstDetailsFromGstin({ ...lookup, business_constitution: null });
    expect(filledGstFields(details)).not.toContain("businessConstitution");
    // cancellation_date is null on an active registration
    expect(filledGstFields(details)).not.toContain("gstCancellationDate");
  });

  it("round-trips a stored vendor row back into the form", () => {
    expect(gstDetailsFromVendor({ gstStatus: "Cancelled", taxpayerType: null })).toEqual({
      gstStatus: "Cancelled",
      taxpayerType: "",
      businessConstitution: "",
      gstRegistrationDate: "",
      gstCancellationDate: "",
      stateJurisdiction: "",
      natureOfBusiness: "",
      blockStatus: "",
      einvoiceStatus: "",
    });
  });
});
