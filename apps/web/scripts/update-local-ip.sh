#!/usr/bin/env bash
#
# build:mobile öncesi çalışır. .env.local içindeki NEXT_PUBLIC_API_URL'in IP
# kısmını güncel Mac (en0) IP'sine günceller; port ve path'e dokunmaz.
#
# IP alınamazsa (ör. Wi-Fi kapalı), satır parse edilemezse ya da IP zaten
# günceldiyse .env.local'a DOKUNMAZ ve 0 ile çıkar — böylece build zinciri
# (&&) kesilmez, mevcut .env.local korunur.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

# Güncel en0 IP'si (Wi-Fi kapalıysa boş döner)
NEW_IP="$(ipconfig getifaddr en0 || true)"

if [ -z "$NEW_IP" ]; then
  echo "⚠️  [update-local-ip] en0 IP alınamadı (Wi-Fi kapalı olabilir). .env.local güncellenmedi." >&2
  exit 0
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "⚠️  [update-local-ip] .env.local bulunamadı, güncelleme atlandı." >&2
  exit 0
fi

# Mevcut satırdaki IP'yi çek (http://IP:port/... formatı beklenir)
OLD_IP="$(sed -nE 's#^NEXT_PUBLIC_API_URL=http://([^:/]+):.*#\1#p' "$ENV_FILE")"

if [ -z "$OLD_IP" ]; then
  echo "⚠️  [update-local-ip] NEXT_PUBLIC_API_URL=http://IP:port/... satırı bulunamadı. .env.local güncellenmedi." >&2
  exit 0
fi

# Zaten günceldiyse sessizce çık
if [ "$OLD_IP" = "$NEW_IP" ]; then
  exit 0
fi

# Yalnızca IP kısmını değiştir (port/path korunur). macOS sed: -i ''
sed -i '' -E "s#(NEXT_PUBLIC_API_URL=http://)[^:/]+(:.*)#\1${NEW_IP}\2#" "$ENV_FILE"

echo "✅ [update-local-ip] IP güncellendi: ${OLD_IP} -> ${NEW_IP}"
