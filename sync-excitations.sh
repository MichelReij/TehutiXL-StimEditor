#!/usr/bin/env bash
# sync-excitations.sh
# Synchroniseert excitation-bestanden vanuit de TehutiXL/Stimuli mappen
# naar de StimEditor source/img mappen.

set -euo pipefail

STIMULI="/Users/michelreij/Machines/TehutiXL/Stimuli"
DEST="/Users/michelreij/Machines/TehutiXL/StimEditor/source/img"

echo "🔄 Synchroniseren excitations..."

# ── Losse exc_###.png's (spiffs) ──────────────────────────────────────
echo "  exc240 PNGs (spiffs)..."
rsync -a --include="exc_*.png" --exclude="*" \
  "$STIMULI/spiffs/exc240/" "$DEST/exc240/"

echo "  exc400 PNGs (spiffs)..."
rsync -a --include="exc_*.png" --exclude="*" \
  "$STIMULI/spiffs/exc400/" "$DEST/exc400/"

# ── Gekleurde versies (sd-card) ───────────────────────────────────────
echo "  exc240/blue..."
rsync -a "$STIMULI/sd-card/exc240/blue/" "$DEST/exc240/blue/"

echo "  exc240/yellow..."
rsync -a "$STIMULI/sd-card/exc240/yellow/" "$DEST/exc240/yellow/"

echo "  exc400/blue..."
rsync -a "$STIMULI/sd-card/exc400/blue/" "$DEST/exc400/blue/"

echo "  exc400/yellow..."
rsync -a "$STIMULI/sd-card/exc400/yellow/" "$DEST/exc400/yellow/"

# ── positions.csv + metadata.txt (spiffs, leading) ───────────────────
echo "  positions.csv + metadata.txt (spiffs)..."
rsync -a --include="positions.csv" --include="metadata.txt" --exclude="*" \
  "$STIMULI/spiffs/exc240/" "$DEST/exc240/"

rsync -a --include="positions.csv" --include="metadata.txt" --exclude="*" \
  "$STIMULI/spiffs/exc400/" "$DEST/exc400/"

# ── positions.csv + metadata.txt (sd-card, fallback/aanvulling) ───────
echo "  positions.csv + metadata.txt (sd-card)..."
rsync -a --include="positions.csv" --include="metadata.txt" --exclude="*" \
  "$STIMULI/sd-card/exc240/" "$DEST/exc240/"

rsync -a --include="positions.csv" --include="metadata.txt" --exclude="*" \
  "$STIMULI/sd-card/exc400/" "$DEST/exc400/"

echo "✅ Klaar."
