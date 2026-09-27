export const mapsKey = process.env.NEXT_PUBLIC_GEOAPIFY_MAPS_API_KEY?.trim();

export const mapAttribution =
  'Powered by <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Geoapify</a> | ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>';

export function mapTiles(retina: boolean) {
  const size = retina ? "@2x" : "";
  return `https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}${size}.png?apiKey=${encodeURIComponent(mapsKey ?? "")}`;
}
