"""Pytest configuration for omero_biomero tests."""

import os
import sys
import types


# Set up stub modules for OMERO web dependencies BEFORE Django configures
def _ensure_stubs():
    # Stub out ezomero (requires a live OMERO connection, not installed locally)
    if "ezomero" not in sys.modules:
        ezomero_mod = types.ModuleType("ezomero")

        def _get_table(conn, table_id):
            return None

        ezomero_mod.get_table = _get_table
        sys.modules["ezomero"] = ezomero_mod

    # Stub out the omero package (OMERO server library, not installed locally)
    if "omero" not in sys.modules:
        omero_mod = types.ModuleType("omero")
        gateway_mod = types.ModuleType("omero.gateway")
        model_mod = types.ModuleType("omero.model")

        class _FileAnnotationWrapper:
            pass

        class _PolygonI:
            pass

        gateway_mod.FileAnnotationWrapper = _FileAnnotationWrapper
        model_mod.PolygonI = _PolygonI
        omero_mod.gateway = gateway_mod
        omero_mod.model = model_mod
        sys.modules["omero"] = omero_mod
        sys.modules["omero.gateway"] = gateway_mod
        sys.modules["omero.model"] = model_mod

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
