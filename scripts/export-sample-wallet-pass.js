#!/usr/bin/env node
/**
 * Export a sample .pkpass file so you can validate it at https://pkpassvalidator.azurewebsites.net/
 * Run from backend root: node scripts/export-sample-wallet-pass.js
 * Requires WALLET_PASS_* env vars (e.g. from .env.local).
 */

const path = require('path');
const fs = require('fs');

// Load env the same way as server
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const walletPassService = require('../src/services/walletPassService');

const sampleReservation = {
  reservation_id: 'sample-for-validation',
  restaurant_name: 'Sample Restaurant',
  restaurant_address: '123 Main St',
  reservation_date: '2026-03-15',
  reservation_time: '19:30',
  party_size: 2,
  confirmation_code: 'SAMPLE1',
};

async function main() {
  if (!walletPassService.isConfigured()) {
    console.error('Wallet is not configured. Set WALLET_PASS_MODEL_DIR, WALLET_PASS_CERT_PATH, WALLET_PASS_KEY_PATH, WALLET_PASS_WWDR_PATH in .env or .env.local');
    process.exit(1);
  }

  const buffer = await walletPassService.generateReservationPass(sampleReservation);
  if (!buffer) {
    console.error('Failed to generate pass (check server logs for Wallet pass generation error).');
    process.exit(1);
  }

  const outPath = path.join(__dirname, '..', 'sample.pkpass');
  fs.writeFileSync(outPath, buffer);
  console.log('Wrote:', outPath);
  console.log('');
  console.log('Next: Upload this file to https://pkpassvalidator.azurewebsites.net/');
  console.log('The validator will show the exact reason if the pass is invalid (e.g. wrong WWDR, Team ID, or Pass Type ID).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
