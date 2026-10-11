import type { Amenity, Listing, ListingType } from "./listings";

export const emptyForm = {
  type: "ROOMMATE" as ListingType,
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
  desiredResidents: "",
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
    type: listing.type,
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
    desiredResidents: listing.desiredResidents?.toString() ?? "",
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
  const wanted = form.type === "ROOM_WANTED";
  return {
    ...form,
    rent: form.rent === "" ? null : Number(form.rent),
    area: form.area === "" ? null : Number(form.area),
    deposit: wanted ? 0 : Number(form.deposit),
    electricityCost: wanted ? 0 : Number(form.electricityCost),
    waterCost: wanted ? 0 : Number(form.waterCost),
    internetCost: wanted ? 0 : Number(form.internetCost),
    otherCost: wanted ? 0 : Number(form.otherCost),
    costNote: wanted ? "" : form.costNote,
    privateAddress: wanted ? "" : form.privateAddress,
    availableSlots: wanted ? 1 : Number(form.availableSlots),
    currentResidents:
      form.type === "ROOMMATE" ? Number(form.currentResidents) : 0,
    desiredResidents:
      form.type === "ROOM_WANTED" && form.desiredResidents !== ""
        ? Number(form.desiredResidents)
        : null,
    availableFrom: wanted ? null : form.availableFrom || null,
    provinceCode: form.provinceCode || null,
    wardCode: form.wardCode || null,
    latitude: wanted || form.latitude === "" ? null : Number(form.latitude),
    longitude: wanted || form.longitude === "" ? null : Number(form.longitude),
    smokingPreference: form.smokingPreference || null,
    petPreference: form.petPreference || null,
    quietLevel: form.quietLevel || null,
  };
}
