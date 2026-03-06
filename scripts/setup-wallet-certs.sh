#!/usr/bin/env bash
#
# Apple Wallet cert setup for TableShare (scripted).
# Run from tableshare-backend root: ./scripts/setup-wallet-certs.sh [path-to.p12]
#
# One manual step (in Keychain, one time):
#   1. Open Keychain Access.
#   2. Find "Pass Type ID: TableShare Reservation Pass" (or the cert you created for pass.com.tableshare.app.reservation).
#   3. Right‑click it → Export → save as .p12 (e.g. TableShareWallet.p12). Set a password or leave blank.
#
# Then run:
#   ./scripts/setup-wallet-certs.sh ~/Desktop/TableShareWallet.p12
#
# This script will:
#   - Download Apple WWDR G4 and create AppleWWDRCA.pem
#   - From your .p12, create signerCert.pem and signerKey.pem
#   - Write all three into certs/
#

set -e
BACKEND_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERTS_DIR="$BACKEND_ROOT/certs"
WWDR_URL="https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer"
WWDR_PEM="$CERTS_DIR/AppleWWDRCA.pem"

mkdir -p "$CERTS_DIR"

echo "=== Apple Wallet cert setup ==="
echo "Output directory: $CERTS_DIR"
echo ""

# --- 1. Download Apple WWDR G4 and convert to PEM ---
echo "[1/2] Downloading Apple WWDR G4 and converting to PEM..."
curl -sSL "$WWDR_URL" -o "$CERTS_DIR/AppleWWDRCAG4.cer"
openssl x509 -inform DER -in "$CERTS_DIR/AppleWWDRCAG4.cer" -out "$WWDR_PEM"
rm -f "$CERTS_DIR/AppleWWDRCAG4.cer"
echo "      -> $WWDR_PEM"
echo ""

# --- 2. If .p12 path given, extract signer cert and key ---
P12_PATH="$1"
if [ -z "$P12_PATH" ]; then
  echo "[2/2] No .p12 file provided."
  echo ""
  echo "To create signerCert.pem and signerKey.pem:"
  echo "  1. In Keychain Access, find the cert 'Pass Type ID: TableShare Reservation Pass'."
  echo "  2. Right-click → Export → save as .p12 (e.g. TableShareWallet.p12)."
  echo "  3. Run this script again with the path to that file:"
  echo "     ./scripts/setup-wallet-certs.sh ~/Desktop/TableShareWallet.p12"
  echo ""
  exit 0
fi

if [ ! -f "$P12_PATH" ]; then
  echo "Error: File not found: $P12_PATH"
  exit 1
fi

echo "[2/2] Extracting signer cert and key from .p12 (you may be prompted for the .p12 password)..."
# Use -legacy to avoid RC2-40-CBC errors on newer OpenSSL
openssl pkcs12 -in "$P12_PATH" -clcerts -nokeys -out "$CERTS_DIR/signerCert.pem" -legacy 2>/dev/null || openssl pkcs12 -in "$P12_PATH" -clcerts -nokeys -out "$CERTS_DIR/signerCert.pem"
openssl pkcs12 -in "$P12_PATH" -nocerts -nodes -out "$CERTS_DIR/signerKey.pem" -legacy 2>/dev/null || openssl pkcs12 -in "$P12_PATH" -nocerts -nodes -out "$CERTS_DIR/signerKey.pem"
echo "      -> $CERTS_DIR/signerCert.pem"
echo "      -> $CERTS_DIR/signerKey.pem"
echo ""

echo "Done. Files in $CERTS_DIR:"
ls -la "$CERTS_DIR"/*.pem 2>/dev/null || true
echo ""
echo "Next: set WALLET_PASS_* env vars (see passModel.pass/README.md) and restart the API."
echo "Production: copy certs/ and passModel.pass/ to the server and set env there, then restart."
