#!/bin/bash
# Initialize OMERO.biomero for development in the OMERO.web container

# Name of the Docker container
CONTAINER_NAME="nl-biomero-omeroweb-1"

# Command to execute inside the container
# COMMAND1="/usr/local/bin/entrypoint.sh"
COMMAND0="chmod a+w /opt/omero/web/OMERO.web/var/static && chmod a+rw /opt/omero/web/OMERO.web/var/slurm-config.ini"

# Mark volume-mounted repos as safe for git (needed by setuptools_scm)
COMMAND_GIT="git config --global --add safe.directory /opt/omero/web/OMERO.biomero && git config --global --add safe.directory /opt/omero/web/omero_annotate_ai && git config --global --add safe.directory /opt/omero/web/OMERO.forms"

COMMAND1="/opt/omero/web/venv3/bin/python -m pip install -e /opt/omero/web/omero_annotate_ai[all] -e /opt/omero/web/OMERO.biomero"
COMMAND2="/opt/omero/web/venv3/bin/omero-biomero-setup"

COMMAND3="/opt/omero/web/venv3/bin/omero web stop || true; rm -f /opt/omero/web/OMERO.web/var/django.pid"
COMMAND4="/opt/omero/web/OMERO.biomero/startup.sh"

docker exec --user root "$CONTAINER_NAME" sh -c "$COMMAND0"
docker exec --user root "$CONTAINER_NAME" sh -c "$COMMAND_GIT"
docker exec --user root "$CONTAINER_NAME" sh -c "$COMMAND1"
docker exec --user root "$CONTAINER_NAME" sh -c "$COMMAND2"
docker exec --user omero-web "$CONTAINER_NAME" sh -c "$COMMAND3"
docker exec --user omero-web "$CONTAINER_NAME" sh -c "$COMMAND4"
