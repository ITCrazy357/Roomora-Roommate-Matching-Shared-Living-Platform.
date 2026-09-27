import type { Amenity, Listing } from "./listings";

export const emptyForm = {
  title: "",
  description: "",
  rent: "",
  deposit: "0",
  electricityCost: "0",
  waterCost: "0",
  internetCost: "0",
  otherCost: "0",
  costNote: "",
  area: "",
  availableSlots: "1",
  currentResidents: "0",
  availableFrom: "",
  provinceCode: "",
  wardCode: "",
  privateAddress: "",
  latitude: "",
  longitude: "",
  amenities: [] as Amenity[],
  roommateNote: "",
  smokingPreference: "",
  petPreference: "",
  quietLevel: "",
};
export type ListingForm = typeof emptyForm;
export type LocationUnit = { code: string; name: string };

export function formFromListing(listing: Listing): ListingForm {
  return {
    title: listing.title,
    description: listing.description,
    rent: listing.rent?.toString() ?? "",
    deposit: String(listing.deposit),
    electricityCost: String(listing.electricityCost),
    waterCost: String(listing.waterCost),
    internetCost: String(listing.internetCost),
    otherCost: String(listing.otherCost),
    costNote: listing.costNote,
    area: listing.area?.toString() ?? "",
    availableSlots: String(listing.availableSlots),
    currentResidents: String(listing.currentResidents),
    availableFrom: listing.availableFrom?.slice(0, 10) ?? "",
    provinceCode: listing.provinceCode ?? "",
    wardCode: listing.wardCode ?? "",
    privateAddress: listing.privateAddress ?? "",
    latitude: listing.latitude?.toString() ?? "",
    longitude: listing.longitude?.toString() ?? "",
    amenities: listing.amenities,
    roommateNote: listing.roommateNote,
    smokingPreference: listing.smokingPreference ?? "",
    petPreference: listing.petPreference ?? "",
    quietLevel: listing.quietLevel ?? "",
  };
}

export function formInput(form: ListingForm) {
  return {
    ...form,
    rent: form.rent === "" ? null : Number(form.rent),
    area: form.area === "" ? null : Number(form.area),
    deposit: Number(form.deposit),
    electricityCost: Number(form.electricityCost),
    waterCost: Number(form.waterCost),
    internetCost: Number(form.internetCost),
    otherCost: Number(form.otherCost),
    availableSlots: Number(form.availableSlots),
    currentResidents: Number(form.currentResidents),
    availableFrom: form.availableFrom || null,
    provinceCode: form.provinceCode || null,
    wardCode: form.wardCode || null,
    latitude: form.latitude === "" ? null : Number(form.latitude),
    longitude: form.longitude === "" ? null : Number(form.longitude),
    smokingPreference: form.smokingPreference || null,
    petPreference: form.petPreference || null,
    quietLevel: form.quietLevel || null,
  };
}
