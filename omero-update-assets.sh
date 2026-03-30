#!/bin/bash
# Update OMERO.biomero assets in the OMERO.web container

# Define the Docker container name
CONTAINER_NAME="nl-biomero-omeroweb-1"

# Define source and destination directories inside the container
SRC_DIR="/opt/omero/web/OMERO.biomero/omero_biomero/static/omero_biomero/assets"
DEST_DIR="/opt/omero/web/OMERO.web/var/static/omero_biomero/assets"

# Wait a moment for files to sync
sleep 1

# Ensure the collected static directory is writable before syncing
docker exec --user root "$CONTAINER_NAME" sh -c "chmod a+w /opt/omero/web/OMERO.web/var/static"

# Refresh collected static files using OMERO.web's built-in sync step.
docker exec "$CONTAINER_NAME" bash -lc "/opt/omero/web/venv3/bin/omero web syncmedia"

# Check if the command was successful
if [ $? -eq 0 ]; then
  echo "Static assets synchronized from $SRC_DIR to $DEST_DIR in container $CONTAINER_NAME."

  # WhiteNoise caches static file metadata by path, so fixed bundle names
  # require an OMERO.web restart after in-place updates.
  echo "Restarting OMERO.web to refresh cached static metadata..."
  docker exec "$CONTAINER_NAME" bash -lc "/opt/omero/web/venv3/bin/omero web restart"
  
  # Ensure readable permissions
  docker exec "$CONTAINER_NAME" bash -c "chmod -R a+rX ${DEST_DIR}"

  # List files for verification
  docker exec "$CONTAINER_NAME" ls -la "${DEST_DIR}/" | head -n 20
else
  echo "Failed to copy files in container $CONTAINER_NAME."
  exit 1
fi
