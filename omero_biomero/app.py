#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
#
#
# Copyright (c) 2016 University of Dundee.
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
# Author: Aleksandra Tarkowska <A(dot)Tarkowska(at)dundee(dot)ac(dot)uk>, 2008.
#
# Version: 1.0
#


import logging
import os
from django.apps import AppConfig
from omero_adi.utils.ingest_tracker import initialize_ingest_tracker

logger = logging.getLogger(__name__)


class OmeroBiomeroAppConfig(AppConfig):
    name = "omero_biomero"
    label = "OMERO.biomero"

    # TODO: Doesn't seem to be called here
    # def ready(self):
    #     """
    #     Called when the app is ready. We initialize the IngestTracker using an environment variable.
    #     """
    #     db_url = os.getenv('INGEST_TRACKING_DB_URL')
    #     if not db_url:
    #         logger.error("Environment variable 'INGEST_TRACKING_DB_URL' not set")
    #         return

    #     config = {'ingest_tracking_db': db_url}

    #     try:
    #         if initialize_ingest_tracker(config):
    #             logger.info("IngestTracker initialized successfully")
    #         else:
    #             logger.error("Failed to initialize IngestTracker")
    #     except Exception as e:
    #         logger.error(f"Unexpected error during IngestTracker initialization: {e}", exc__info=True)