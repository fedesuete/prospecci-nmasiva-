#!/bin/bash
# Auto-deploy: pull + rebuild + restart
cd /opt/prospeccion

echo "$(date) - Checking for updates..."
git fetch origin main 2>&1

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "$(date) - New changes detected, deploying..."
    git reset --hard origin/main

    # Rebuild y restart
    docker compose -f docker-compose.prod.yml up -d --build prospeccion-api prospeccion-frontend prospeccion-sender 2>&1

    # Re-copiar audios al volumen (se pierden con rebuild)
    sleep 3
    docker cp /tmp/pitch_variante_1.ogg prospeccion-api:/app/storage/audios/pitch_variante_1.ogg 2>/dev/null
    docker cp /tmp/pitch_variante_2.ogg prospeccion-api:/app/storage/audios/pitch_variante_2.ogg 2>/dev/null

    echo "$(date) - Deploy completado!"
else
    echo "$(date) - Sin cambios"
fi
