#!/bin/bash

# Directory to monitor
WATCHED_DIR="omero_boost"

# Name of the Docker container
CONTAINER_NAME="nl-biomero-omeroweb-1"

# Command to execute inside the container
COMMAND0="chmod a+w /opt/omero/web/OMERO.web/var/static"
COMMAND1="/opt/omero/web/venv3/bin/pip install -e /opt/omero/web/omero-boost"
COMMAND2="/opt/omero/web/venv3/bin/omero-boost-setup"
COMMAND3="/opt/omero/web/venv3/bin/omero web stop"
COMMAND4="/opt/omero/web/omero-boost/startup.sh"

docker exec --user root "$CONTAINER_NAME" sh -c "$COMMAND2"
docker exec --user omero-web "$CONTAINER_NAME" sh -c "$COMMAND3"
docker exec --user omero-web "$CONTAINER_NAME" sh -c "$COMMAND4"