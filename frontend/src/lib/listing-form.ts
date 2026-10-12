import {
  listingHasRoom,
  type Amenity,
  type Listing,
  type ListingType,
} from "./listings";

export const emptyForm = {
  type: "ROOMMATE" as ListingType,
  hasRoom: true,
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
    hasRoom: listingHasRoom(listing),
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
  const hasRoom = listingHasRoom(form);
  return {
    ...form,
    hasRoom,
    rent: form.rent === "" ? null : Number(form.rent),
    area: (!hasRoom && !wanted) || form.area === "" ? null : Number(form.area),
    deposit: hasRoom ? Number(form.deposit) : 0,
    electricityCost: hasRoom ? Number(form.electricityCost) : 0,
    waterCost: hasRoom ? Number(form.waterCost) : 0,
    internetCost: hasRoom ? Number(form.internetCost) : 0,
    otherCost: hasRoom ? Number(form.otherCost) : 0,
    costNote: hasRoom ? form.costNote : "",
    privateAddress: hasRoom ? form.privateAddress : "",
    availableSlots: hasRoom ? Number(form.availableSlots) : 1,
    currentResidents:
      form.type === "ROOMMATE" && hasRoom ? Number(form.currentResidents) : 0,
    desiredResidents:
      form.type === "ROOM_WANTED" && form.desiredResidents !== ""
        ? Number(form.desiredResidents)
        : null,
    availableFrom:
      form.type === "ROOM_RENTAL" ? form.availableFrom || null : null,
    provinceCode: form.provinceCode || null,
    wardCode: form.wardCode || null,
    latitude: !hasRoom || form.latitude === "" ? null : Number(form.latitude),
    longitude:
      !hasRoom || form.longitude === "" ? null : Number(form.longitude),
    smokingPreference: form.smokingPreference || null,
    petPreference: form.petPreference || null,
    quietLevel: form.quietLevel || null,
  };
}
