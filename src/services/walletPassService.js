/**
 * Apple Wallet pass generation for reservations.
 * Requires Apple Pass Type ID certificate and a pass model (see README in passModel.pass).
 *
 * Env (all optional; if missing, generateReservationPass returns null):
 *   WALLET_PASS_MODEL_DIR  - path to .pass folder (e.g. ./passModel.pass)
 *   WALLET_PASS_CERT_PATH  - path to signer certificate .pem
 *   WALLET_PASS_KEY_PATH   - path to signer private key .pem
 *   WALLET_PASS_WWDR_PATH  - path to Apple WWDR certificate .pem
 *   WALLET_PASS_KEY_PASSPHRASE - optional passphrase for key
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = null;
}

const STRIP_WIDTH = 750;
const STRIP_HEIGHT = 246;
const BAND_HEIGHT = 56; // "TableShare" bar at very top so pass is identifiable in Wallet stack

/** Fetch image from URL and resize to given dimensions. Returns PNG buffer or null. */
async function fetchImageBuffer(imageUrl, width, height) {
  const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 8000, maxContentLength: 5 * 1024 * 1024 });
  const input = Buffer.from(res.data);
  if (!sharp) return null;
  return sharp(input)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
}

/** Generate the "TableShare" top band only (750 x BAND_HEIGHT). Always shown at very top of strip. */
function generateTableShareBand() {
  if (!sharp) return null;
  const svg = `
<svg width="${STRIP_WIDTH}" height="${BAND_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#2d3748"/>
  <text x="50%" y="50%" text-anchor="middle" dy="0.35em" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600" fill="#ffffff">TableShare</text>
</svg>`;
  try {
    return sharp(Buffer.from(svg))
      .png()
      .toBuffer();
  } catch (err) {
    console.warn('Wallet pass: band generation failed', err.message);
    return null;
  }
}

/** Build full strip with TableShare band at top + restaurant photo or subtitle below. */
async function buildStripWithBranding(restaurantName, restaurantPhotoBuffer) {
  if (!sharp) return null;
  const bandBuffer = generateTableShareBand();
  if (!bandBuffer) return null;

  const photoHeight = STRIP_HEIGHT - BAND_HEIGHT; // 190

  if (restaurantPhotoBuffer && restaurantPhotoBuffer.length > 0) {
    try {
      const photoResized = await sharp(restaurantPhotoBuffer)
        .resize(STRIP_WIDTH, photoHeight, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer();
      return sharp({
        create: { width: STRIP_WIDTH, height: STRIP_HEIGHT, channels: 3, background: '#2d3748' },
      })
        .composite([
          { input: bandBuffer, top: 0, left: 0 },
          { input: photoResized, top: BAND_HEIGHT, left: 0 },
        ])
        .png()
        .toBuffer();
    } catch (err) {
      console.warn('Wallet pass: strip composite failed', err.message);
    }
  }

  // No photo: band + "Reservation at [restaurant]" below
  const subtitle = restaurantName ? `Reservation at ${String(restaurantName).slice(0, 32)}` : 'Table reservation';
  const lowerSvg = `
<svg width="${STRIP_WIDTH}" height="${photoHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#2d3748"/>
  <text x="50%" y="50%" text-anchor="middle" dy="0.35em" font-family="system-ui, -apple-system, sans-serif" font-size="22" fill="#e2e8f0">${escapeXml(subtitle)}</text>
</svg>`;
  try {
    const lowerBuffer = await sharp(Buffer.from(lowerSvg)).png().toBuffer();
    return sharp({
      create: { width: STRIP_WIDTH, height: STRIP_HEIGHT, channels: 3, background: '#2d3748' },
    })
      .composite([
        { input: bandBuffer, top: 0, left: 0 },
        { input: lowerBuffer, top: BAND_HEIGHT, left: 0 },
      ])
      .png()
      .toBuffer();
  } catch (err) {
    console.warn('Wallet pass: fallback strip failed', err.message);
    return null;
  }
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Normalize reservation_date to YYYY-MM-DD (handles Date from DB or ISO string). */
function toYYYYMMDD(val) {
  if (val == null) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {}
  return '';
}

/** Format YYYY-MM-DD as US-friendly date e.g. "Sat, Mar 8, 2026". */
function formatPassDate(dateStr) {
  const trimmed = toYYYYMMDD(dateStr);
  if (!trimmed) return '';
  try {
    const d = new Date(trimmed + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

/** Format reservation_time (HH:MM or HH:MM:SS) as US 12-hour e.g. "7:00 PM". */
function formatPassTime(timeStr) {
  if (timeStr == null) return '';
  const s = String(timeStr).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return s;
  let h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

let PKPass;
try {
  PKPass = require('passkit-generator').PKPass;
} catch (e) {
  PKPass = null;
}

function loadCertificates() {
  const certPath = process.env.WALLET_PASS_CERT_PATH;
  const keyPath = process.env.WALLET_PASS_KEY_PATH;
  const wwdrPath = process.env.WALLET_PASS_WWDR_PATH;
  if (!certPath || !keyPath || !wwdrPath) return null;
  try {
    const signerCert = fs.readFileSync(path.resolve(certPath));
    const signerKey = fs.readFileSync(path.resolve(keyPath));
    const wwdr = fs.readFileSync(path.resolve(wwdrPath));
    const signerKeyPassphrase = process.env.WALLET_PASS_KEY_PASSPHRASE || undefined;
    return { wwdr, signerCert, signerKey, signerKeyPassphrase };
  } catch (err) {
    console.warn('Wallet pass: failed to load certificates', err.message);
    return null;
  }
}

const certs = loadCertificates();
const modelDir = process.env.WALLET_PASS_MODEL_DIR
  ? path.resolve(process.env.WALLET_PASS_MODEL_DIR)
  : path.join(__dirname, '..', 'passModel.pass');

/**
 * Check if Wallet pass generation is configured (model + certs).
 */
function isConfigured() {
  if (!PKPass) return false;
  if (!certs) return false;
  try {
    const stat = fs.statSync(modelDir);
    if (!stat.isDirectory()) return false;
    const passJsonPath = path.join(modelDir, 'pass.json');
    if (!fs.existsSync(passJsonPath)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a .pkpass buffer for a reservation.
 * @param {object} reservation - { reservation_id, restaurant_name, restaurant_address, reservation_date, reservation_time, party_size, confirmation_code }
 * @returns {Promise<Buffer|null>} - .pkpass buffer or null if not configured / error
 */
async function generateReservationPass(reservation) {
  if (!PKPass || !certs || !reservation) return null;
  const passJsonPath = path.join(modelDir, 'pass.json');
  if (!fs.existsSync(passJsonPath)) return null;

  try {
    const serialNumber = reservation.reservation_id || `res-${Date.now()}`;
    const restaurantName = reservation.restaurant_name || 'Restaurant';
    const dateStr = toYYYYMMDD(reservation.reservation_date);
    const timeStr = String(reservation.reservation_time || '').slice(0, 5);
    const partySize = reservation.party_size != null ? Number(reservation.party_size) : 0;
    const confirmationCode = reservation.confirmation_code || serialNumber.slice(0, 8);

    const pass = await PKPass.from(
      { model: modelDir, certificates: certs },
      {
        serialNumber,
        description: `Table reservation at ${restaurantName}`,
        organizationName: 'TableShare',
        backgroundColor: '#ffffff',
        foregroundColor: '#1a1a2e',
        labelColor: '#4a5568',
      }
    );

    const dateLabel = formatPassDate(dateStr);
    const timeLabel = formatPassTime(timeStr);

    pass.primaryFields.push({ key: 'event', label: 'RESTAURANT', value: restaurantName });
    pass.secondaryFields.push({ key: 'date', label: 'DATE', value: dateLabel || '—' }, { key: 'time', label: 'TIME', value: timeLabel || '—' });
    if (partySize) pass.auxiliaryFields.push({ key: 'party', label: 'PARTY OF', value: String(partySize) });
    pass.backFields.push(
      { key: 'code', label: 'Confirmation', value: confirmationCode },
      { key: 'address', label: 'Address', value: reservation.restaurant_address || '' }
    );
    const cuisine = reservation.restaurant_cuisine ? String(reservation.restaurant_cuisine).trim() : '';
    if (cuisine) pass.backFields.push({ key: 'cuisine', label: 'Cuisine', value: cuisine });
    pass.backFields.push({ key: 'brand', label: '', value: 'Saved with TableShare' });

    pass.setBarcodes(confirmationCode);

    if (dateStr && timeStr) {
      try {
        const relevantDate = new Date(`${dateStr}T${timeStr}:00`);
        pass.setRelevantDate(relevantDate);
      } catch {
        try {
          pass.setRelevantDate(new Date(dateStr + 'T12:00:00'));
        } catch { /* ignore */ }
      }
    }

    let stripBuffer = null;
    let restaurantPhotoBuffer = null;
    const stripUrl = reservation.restaurant_photo_url || reservation.restaurant_thumbnail;
    if (stripUrl && sharp && typeof stripUrl === 'string' && stripUrl.startsWith('http')) {
      try {
        restaurantPhotoBuffer = await fetchImageBuffer(stripUrl, STRIP_WIDTH, STRIP_HEIGHT - BAND_HEIGHT);
      } catch (err) {
        console.warn('Wallet pass: strip image failed', err.message);
      }
    }
    stripBuffer = await buildStripWithBranding(restaurantName, restaurantPhotoBuffer);
    if (stripBuffer && stripBuffer.length > 0) {
      pass.addBuffer('strip.png', stripBuffer);
      pass.addBuffer('strip@2x.png', stripBuffer);
    }

    return pass.getAsBuffer();
  } catch (err) {
    console.error('Wallet pass generation error:', err);
    return null;
  }
}

module.exports = {
  isConfigured,
  generateReservationPass,
};
