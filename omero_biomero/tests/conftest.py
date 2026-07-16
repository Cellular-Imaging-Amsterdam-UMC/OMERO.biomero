"""Pytest configuration for omero_biomero tests."""

import os
import sys
import types


# Set up stub modules for OMERO web dependencies BEFORE Django configures
def _ensure_stubs():
    if "omeroweb.webclient.decorators" not in sys.modules:
        sys.modules.setdefault("omeroweb", types.ModuleType("omeroweb"))
        sys.modules.setdefault(
            "omeroweb.webclient", types.ModuleType("omeroweb.webclient")
        )
        dec = types.ModuleType("omeroweb.webclient.decorators")

        def login_required(*a, **k):
            def wrap(fn):
                return fn

            return wrap

        def render_response(*a, **k):
            def wrap(fn):
                return fn

            return wrap

        dec.login_required = login_required
        dec.render_response = render_response
        sys.modules["omeroweb.webclient.decorators"] = dec

    if "omero.rtypes" not in sys.modules:
        omero_pkg = sys.modules.setdefault("omero", types.ModuleType("omero"))
        omero_pkg.__path__ = []
        rtypes = types.ModuleType("omero.rtypes")

        def unwrap(value):
            return value.getValue() if hasattr(value, "getValue") else value

        rtypes.unwrap = unwrap
        rtypes.wrap = lambda value: value
        rtypes.rbool = lambda value: value
        rtypes.rlong = lambda value: value
        rtypes.rlist = lambda value: value
        model = types.ModuleType("omero.model")
        omero_pkg.rtypes = rtypes
        omero_pkg.model = model
        sys.modules["omero.rtypes"] = rtypes
        sys.modules["omero.model"] = model

    if "biomero_importer.utils.ingest_tracker" not in sys.modules:
        pkg = types.ModuleType("biomero_importer")
        utils_pkg = types.ModuleType("biomero_importer.utils")
        ing = types.ModuleType("biomero_importer.utils.ingest_tracker")

        def initialize_ingest_tracker(cfg):
            return True

        def log_ingestion_step(order, stage):
            pass

        ing.initialize_ingest_tracker = initialize_ingest_tracker
        ing.log_ingestion_step = log_ingestion_step
        ing.STAGE_NEW_ORDER = "NEW_ORDER"
        sys.modules["biomero_importer"] = pkg
        sys.modules["biomero_importer.utils"] = utils_pkg
        sys.modules["biomero_importer.utils.ingest_tracker"] = ing


# Apply stubs first
_ensure_stubs()

# Configure Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "omero_biomero.test_settings")

import django

django.setup()
