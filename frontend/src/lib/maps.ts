import { apiUrl } from "./api";

export const mapAttribution =
  'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> | ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>';

export function mapTiles(retina: boolean) {
  return apiUrl(
    `/locations/map/tiles/{z}/{x}/{y}?retina=${retina ? "1" : "0"}`,
  );
}
