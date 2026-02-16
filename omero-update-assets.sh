#!/bin/bash
# Update OMERO.biomero assets in the OMERO.web container

# Define the Docker container name
CONTAINER_NAME="nl-biomero-omeroweb-1"

# Define source and destination directories inside the container
SRC_DIR="/opt/omero/web/OMERO.biomero/omero_biomero/static/omero_biomero/assets"
DEST_DIR="/opt/omero/web/OMERO.web/var/static/omero_biomero/assets"

# Wait a moment for files to sync
sleep 1

# Execute the Docker command to copy files
# Use `.` glob to handle empty directory and allow hidden files, but safer than `*` failure
docker exec "$CONTAINER_NAME" bash -c "mkdir -p ${DEST_DIR} && cp -r ${SRC_DIR}/. ${DEST_DIR}/"

# Check if the command was successful
if [ $? -eq 0 ]; then
  echo "Files successfully copied from $SRC_DIR to $DEST_DIR in container $CONTAINER_NAME."
  
  # Ensure readable permissions
  docker exec "$CONTAINER_NAME" bash -c "chmod -R a+rX ${DEST_DIR}"
  
  # Restart omero-web to pick up template changes and new asset manifest
  echo "Restarting OMERO.web (Django)..."
  docker exec "$CONTAINER_NAME" bash -c "/opt/omero/web/venv3/bin/omero web restart" || echo "OMERO.web restart failed. Is it running?"

  # List files for verification
  docker exec "$CONTAINER_NAME" ls -la "${DEST_DIR}/" | head -n 20
else
  echo "Failed to copy files in container $CONTAINER_NAME."
  exit 1
fi