const { query } = require('../config/database');

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_BASE = 'https://places.googleapis.com/v1/places';
const GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';

async function searchPlace(name, city) {
  const res = await fetch(`${PLACES_BASE}:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.googleMapsUri,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours,places.photos,places.priceLevel',
    },
    body: JSON.stringify({
      textQuery: `${name} restaurant ${city}`,
      maxResultCount: 1,
    }),
  });

  const data = await res.json();
  if (!data.places || data.places.length === 0) return null;
  return data.places[0];
}

async function autocomplete(input, locationBias) {
  const body = {
    input,
    includedPrimaryTypes: ['restaurant'],
    languageCode: 'en',
  };

  if (locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.lat, longitude: locationBias.lng },
        radius: locationBias.radius || 50000,
      },
    };
  }

  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
    },
    body: JSON.stringify(body),
  });

  return res.json();
}

async function getPlaceDetails(placeId) {
  const res = await fetch(`${PLACES_BASE}/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,rating,nationalPhoneNumber,websiteUri,regularOpeningHours,photos,priceLevel,types',
    },
  });
  return res.json();
}

function mapPriceLevel(priceLevel) {
  const map = {
    PRICE_LEVEL_FREE: '$',
    PRICE_LEVEL_INEXPENSIVE: '$',
    PRICE_LEVEL_MODERATE: '$$',
    PRICE_LEVEL_EXPENSIVE: '$$$',
    PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
  };
  return map[priceLevel] || '$$';
}

function formatHours(openingHours) {
  if (!openingHours || !openingHours.weekdayDescriptions) return null;
  return openingHours.weekdayDescriptions.join('\n');
}

async function geocodeAddress(address, city) {
  const q = encodeURIComponent(`${address}, ${city}`);
  const res = await fetch(`${GEOCODE_BASE}?address=${q}&key=${API_KEY}`);
  const data = await res.json();
  if (data.results && data.results.length > 0) {
    return data.results[0].geometry.location;
  }
  return null;
}

async function backfillRestaurant(restaurant) {
  const place = await searchPlace(restaurant.name, restaurant.city || 'USA');
  if (!place) return { updated: false, name: restaurant.name, reason: 'not found' };

  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  const placeId = place.id;
  const phone = place.nationalPhoneNumber || restaurant.phone;
  const website = place.websiteUri || restaurant.website;
  const hours = formatHours(place.regularOpeningHours) || restaurant.hours;
  const address = place.formattedAddress || restaurant.address;
  const rating = place.rating || restaurant.rating;
  const priceRange = place.priceLevel ? mapPriceLevel(place.priceLevel) : restaurant.price_range;

  await query(
    `UPDATE restaurants SET
      latitude = COALESCE($1, latitude),
      longitude = COALESCE($2, longitude),
      google_place_id = COALESCE($3, google_place_id),
      phone = COALESCE($4, phone),
      website = COALESCE($5, website),
      hours = COALESCE($6, hours),
      address = COALESCE($7, address),
      rating = COALESCE($8, rating),
      price_range = COALESCE($9, price_range)
    WHERE restaurant_id = $10`,
    [lat, lng, placeId, phone, website, hours, address, rating, priceRange, restaurant.restaurant_id]
  );

  return { updated: true, name: restaurant.name, placeId, lat, lng };
}

async function backfillAll() {
  const result = await query(
    'SELECT * FROM restaurants WHERE latitude IS NULL OR google_place_id IS NULL ORDER BY name'
  );

  const results = [];
  for (const restaurant of result.rows) {
    try {
      const r = await backfillRestaurant(restaurant);
      results.push(r);
      // Respect rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      results.push({ updated: false, name: restaurant.name, reason: err.message });
    }
  }
  return results;
}

async function findNearby(lat, lng, radiusMiles = 10, limit = 50) {
  const radiusDegrees = radiusMiles / 69.0;

  const result = await query(
    `SELECT *,
      (
        3959 * acos(
          cos(radians($1)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
        )
      ) AS distance_miles
    FROM restaurants
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND latitude BETWEEN $1 - $3 AND $1 + $3
      AND longitude BETWEEN $2 - $3 AND $2 + $3
    ORDER BY distance_miles ASC
    LIMIT $4`,
    [lat, lng, radiusDegrees, limit]
  );

  return result.rows;
}

module.exports = {
  searchPlace,
  autocomplete,
  getPlaceDetails,
  backfillRestaurant,
  backfillAll,
  findNearby,
  geocodeAddress,
  mapPriceLevel,
  formatHours,
};
