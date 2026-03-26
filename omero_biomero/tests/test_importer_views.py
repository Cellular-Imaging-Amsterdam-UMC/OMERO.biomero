import os
import sys
import json
import tempfile
import uuid as _uuid
import types
import shutil
from typing import Any
from unittest.mock import MagicMock
from django.test import TestCase, RequestFactory
from django.http import JsonResponse

_INGEST_LOG = []


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
            # In production this turns dict into template response; tests keep dict
            def wrap(fn):
                return fn

            return wrap

        dec.login_required = login_required  # type: ignore[attr-defined]
        dec.render_response = render_response  # type: ignore[attr-defined]
        sys.modules["omeroweb.webclient.decorators"] = dec

    if "biomero_importer.utils.ingest_tracker" not in sys.modules:
        pkg = types.ModuleType("biomero_importer")
        utils_pkg = types.ModuleType("biomero_importer.utils")
        ing = types.ModuleType("biomero_importer.utils.ingest_tracker")

        def initialize_ingest_tracker(cfg):
            return True

        def log_ingestion_step(order, stage):
            _INGEST_LOG.append((order, stage))

        ing.initialize_ingest_tracker = initialize_ingest_tracker  # type: ignore[attr-defined]
        ing.log_ingestion_step = log_ingestion_step  # type: ignore[attr-defined]
        ing.STAGE_NEW_ORDER = "NEW_ORDER"  # type: ignore[attr-defined]
        sys.modules["biomero_importer"] = pkg
        sys.modules["biomero_importer.utils"] = utils_pkg
        sys.modules["biomero_importer.utils.ingest_tracker"] = ing


def _import_module():
    import importlib

    name = "omero_biomero.importer_views"
    if name in sys.modules:
        return importlib.reload(sys.modules[name])
    return importlib.import_module(name)


def _raw(fn):
    return fn


class LeicaHelperTests(TestCase):
    def test_extract_nested_leica_items_flattens_image_nodes(self):
        from omero_biomero.leica_file_browser import ci_leica_converters_helpers as helpers

        original = helpers.read_leica_file

        def stub_read_leica_file(file_path, include_xmlelement=False, image_uuid=None, folder_uuid=None):
            return json.dumps(
                {
                    "type": "Folder",
                    "children": [
                        {"type": "Image", "uuid": "img-1", "name": "Image 1"},
                        {
                            "type": "Folder",
                            "uuid": "folder-1",
                            "children": [
                                {"type": "Image", "uuid": "img-2", "name": "Image 2"}
                            ],
                        },
                    ],
                }
            )

        helpers.read_leica_file = stub_read_leica_file
        self.addCleanup(setattr, helpers, "read_leica_file", original)

        items = helpers.extract_nested_leica_items("nested.lif")

        self.assertCountEqual(
            items,
            [
                {"localPath": "nested.lif", "uuid": "img-1", "name": "Image 1"},
                {"localPath": "nested.lif", "uuid": "img-2", "name": "Image 2"},
            ],
        )

    def test_extract_nested_leica_items_loads_nested_lif_folders_by_uuid(self):
        from omero_biomero.leica_file_browser import ci_leica_converters_helpers as helpers

        original = helpers.read_leica_file

        def stub_read_leica_file(file_path, include_xmlelement=False, image_uuid=None, folder_uuid=None):
            self.assertEqual(file_path, "nested.lif")
            self.assertIsNone(image_uuid)

            if folder_uuid == "folder-a":
                return json.dumps(
                    {
                        "type": "Folder",
                        "uuid": "folder-a",
                        "children": [
                            {"type": "Folder", "uuid": "folder-b", "name": "Folder B", "children": []},
                            {"type": "Image", "uuid": "img-1", "name": "Image 1", "children": []},
                        ],
                    }
                )

            if folder_uuid == "folder-b":
                return json.dumps(
                    {
                        "type": "Folder",
                        "uuid": "folder-b",
                        "children": [
                            {"type": "Image", "uuid": "img-2", "name": "Image 2", "children": []},
                        ],
                    }
                )

            return json.dumps(
                {
                    "type": "File",
                    "children": [
                        {"type": "Folder", "uuid": "folder-a", "name": "Folder A", "children": []},
                    ],
                }
            )

        helpers.read_leica_file = stub_read_leica_file
        self.addCleanup(setattr, helpers, "read_leica_file", original)

        items = helpers.extract_nested_leica_items("nested.lif")

        self.assertCountEqual(
            items,
            [
                {"localPath": "nested.lif", "uuid": "img-1", "name": "Image 1"},
                {"localPath": "nested.lif", "uuid": "img-2", "name": "Image 2"},
            ],
        )

    def test_extract_nested_leica_items_accepts_real_lif_image_shape(self):
        from omero_biomero.leica_file_browser import ci_leica_converters_helpers as helpers

        original = helpers.read_leica_file

        def stub_read_leica_file(file_path, include_xmlelement=False, image_uuid=None, folder_uuid=None):
            self.assertEqual(file_path, "nested.lif")
            self.assertIsNone(image_uuid)
            self.assertIsNone(folder_uuid)
            return json.dumps(
                {
                    "type": "File",
                    "children": [
                        {"datatype": "Image", "uuid": "img-1", "name": "Image 1"},
                        {"datatype": "Image", "uuid": "img-2", "name": "Image 2"},
                    ],
                }
            )

        helpers.read_leica_file = stub_read_leica_file
        self.addCleanup(setattr, helpers, "read_leica_file", original)

        items = helpers.extract_nested_leica_items("nested.lif")

        self.assertCountEqual(
            items,
            [
                {"localPath": "nested.lif", "uuid": "img-1", "name": "Image 1"},
                {"localPath": "nested.lif", "uuid": "img-2", "name": "Image 2"},
            ],
        )


class ImporterViewsTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        _ensure_stubs()

    def setUp(self):
        self.tmp = os.path.abspath(self._mk_tmp())
        _INGEST_LOG.clear()
        self.conn = self._fake_conn(["grp1", "grp2"], admin=True)
        self.factory = RequestFactory()
        self.mod = _import_module()
        # Patch constants dynamically
        setattr(self.mod, "BASE_DIR", self.tmp)  # type: ignore[attr-defined]
        setattr(self.mod, "FILE_OR_EXTENSION_PATTERNS_EXCLUSIVE", ["experiment.db", ".xlef"])  # type: ignore[attr-defined]
        setattr(self.mod, "PREPROCESSING_EXTENSION_MAP", {".lif": "leica_uuid", ".db": "screen_db"})  # type: ignore[attr-defined]
        setattr(self.mod, "UPLOADER_NESTED_FILE_EXTENSIONS", [".lif", ".xlef"])  # type: ignore[attr-defined]
        setattr(
            self.mod,
            "PREPROCESSING_CONFIG",
            {
                "leica_uuid": {
                    "container": "leica:latest",
                    "extra_params": {"image_uuid": "{UUID}"},
                },
                "screen_db": {
                    "container": "screen:latest",
                    "extra_params": {"saveoption": "single"},
                },
            },
        )  # type: ignore[attr-defined]

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    # Helpers
    def _mk_tmp(self):
        return tempfile.mkdtemp(prefix="test_importer_")

    def _fake_conn(self, groups, admin=False, user_id=5, username="alice"):
        user = MagicMock()
        user.getName.return_value = username
        user.getId.return_value = user_id
        grp_objs = []
        for g in groups:
            go = MagicMock()
            go.getName.return_value = g
            grp_objs.append(go)
        conn = MagicMock()
        conn.getUser.return_value = user
        conn.getGroupsMemberOf.return_value = grp_objs
        conn.isAdmin.return_value = admin
        return conn

    def _call_get_folder(self, params=None, expect_ok=True):
        req = self.factory.get("/importer/get_folder_contents", data=params or {})
        res = _raw(self.mod.get_folder_contents)(req, conn=self.conn)
        if isinstance(res, dict):
            return res
        # Some environments may still yield JsonResponse; decode if so
        if isinstance(res, JsonResponse):
            try:
                data = json.loads(res.content.decode("utf-8"))
                return data
            except Exception:
                pass
        if expect_ok:
            self.fail(
                f"Expected dict/JsonResponse with JSON, got {type(res)} -> {getattr(res, 'status_code', 'no-status')} "
            )
        return res

    # get_folder_contents tests
    def test_get_folder_contents_normal_listing(self):
        os.makedirs(os.path.join(self.tmp, "subdir"))
        for name in ["b.txt", "a.txt", "sample.zarr"]:
            open(os.path.join(self.tmp, name), "w").close()
        ctx = self._call_get_folder()
        names = [c["name"] for c in ctx["contents"]]
        self.assertEqual(names, ["subdir", "a.txt", "b.txt", "sample.zarr"])
        self.assertTrue(ctx["contents"][0]["is_folder"])

    def test_get_folder_contents_special_exact(self):
        open(os.path.join(self.tmp, "experiment.db"), "w").close()
        open(os.path.join(self.tmp, "ignore.txt"), "w").close()
        ctx = self._call_get_folder()
        self.assertEqual([c["name"] for c in ctx["contents"]], ["experiment.db"])

    def test_get_folder_contents_duplicate_extension_error(self):
        open(os.path.join(self.tmp, "a.xlef"), "w").close()
        open(os.path.join(self.tmp, "b.xlef"), "w").close()
        resp: Any = self._call_get_folder(expect_ok=False)
        self.assertEqual(getattr(resp, "status_code", None), 400)

    def test_get_folder_contents_conflicting_patterns(self):
        open(os.path.join(self.tmp, "experiment.db"), "w").close()
        open(os.path.join(self.tmp, "c.xlef"), "w").close()
        resp: Any = self._call_get_folder(expect_ok=False)
        self.assertEqual(getattr(resp, "status_code", None), 400)

    def test_get_folder_contents_file_browser_extension(self):
        def stub_browser(
            path, folder_uuid=None, image_uuid=None
        ):  # pragma: no cover - simple stub
            return json.dumps(
                {
                    "children": [
                        {"name": "img1", "uuid": "u1", "type": "Image"},
                        {"name": "FolderA", "uuid": "f1", "type": "Folder"},
                    ]
                }
            )

        setattr(self.mod, "EXTENSION_TO_FILE_BROWSER", {".lif": stub_browser})  # type: ignore[attr-defined]
        open(os.path.join(self.tmp, "test.lif"), "w").close()
        ctx = self._call_get_folder({"item_id": "test.lif"})
        self.assertEqual({c["name"] for c in ctx["contents"]}, {"img1", "FolderA"})

    def test_get_folder_contents_file_browser_uuid_and_folder_flag(self):
        def stub_browser(path, folder_uuid=None, image_uuid=None):  # pragma: no cover
            uid = folder_uuid or image_uuid
            return json.dumps(
                {"children": [{"name": "Only", "uuid": uid or "x", "type": "Image"}]}
            )

        setattr(self.mod, "EXTENSION_TO_FILE_BROWSER", {".lif": stub_browser})  # type: ignore[attr-defined]
        open(os.path.join(self.tmp, "abc.lif"), "w").close()
        ctx = self._call_get_folder({"item_id": "abc.lif#ZZZ", "is_folder": 1})
        self.assertEqual(len(ctx["contents"]), 1)
        self.assertTrue(ctx["contents"][0]["id"].startswith("abc.lif#"))

    def test_get_folder_contents_supported_extension_path(self):
        open(os.path.join(self.tmp, "sample.tif"), "w").close()
        ctx = self._call_get_folder({"item_id": "sample.tif"})
        self.assertEqual(len(ctx["contents"]), 1)
        self.assertFalse(ctx["contents"][0]["is_folder"])

    def test_get_folder_contents_zarr_directory(self):
        os.makedirs(os.path.join(self.tmp, "thing.zarr"))
        ctx = self._call_get_folder({"item_id": "thing.zarr"})
        self.assertEqual(len(ctx["contents"]), 1)
        self.assertFalse(ctx["contents"][0]["is_folder"])

    def test_get_folder_contents_invalid_extension(self):
        open(os.path.join(self.tmp, "bad.ext"), "w").close()
        resp = self._call_get_folder({"item_id": "bad.ext"}, expect_ok=False)
        self.assertEqual(getattr(resp, "status_code", None), 400)

    def test_get_folder_contents_special_extension_only(self):
        def stub_browser(path, folder_uuid=None, image_uuid=None):  # pragma: no cover
            return json.dumps({"children": []})

        setattr(self.mod, "EXTENSION_TO_FILE_BROWSER", {".xlef": stub_browser})  # type: ignore[attr-defined]
        open(os.path.join(self.tmp, "one.xlef"), "w").close()
        open(os.path.join(self.tmp, "ignored.txt"), "w").close()
        ctx = self._call_get_folder()
        self.assertEqual([c["name"] for c in ctx["contents"]], ["one.xlef"])

    # import_selected tests
    def _post_import(self, payload, conn=None):
        req = self.factory.post(
            "/importer/import_selected",
            data=json.dumps(payload),
            content_type="application/json",
        )
        return _raw(self.mod.import_selected)(req, conn=conn or self.conn)

    def test_import_selected_missing_fields(self):
        self.assertEqual(self._post_import({"upload": {}}).status_code, 400)
        self.assertEqual(
            self._post_import({"upload": {"selectedLocal": ["a.txt"]}}).status_code, 400
        )
        self.assertEqual(
            self._post_import(
                {
                    "upload": {
                        "selectedLocal": ["a.txt"],
                        "selectedOmero": [("datasets", 5)],
                    }
                }
            ).status_code,
            400,
        )

    def test_import_selected_group_membership(self):
        payload = {
            "upload": {
                "selectedLocal": ["file1.txt"],
                "selectedOmero": [("datasets", 9)],
                "group": "grp1",
            }
        }
        self.assertEqual(self._post_import(payload).status_code, 200)
        payload["upload"]["group"] = "bad"
        self.assertEqual(self._post_import(payload).status_code, 403)

    def test_import_selected_creates_orders_no_preprocessing(self):
        setattr(self.mod, "PREPROCESSING_EXTENSION_MAP", {})  # type: ignore[attr-defined]
        created = []
        setattr(self.mod, "create_upload_order", lambda order: created.append(order))  # type: ignore[attr-defined]
        payload = {
            "upload": {
                "selectedLocal": ["alpha.txt", "beta.txt"],
                "selectedOmero": [("datasets", 2)],
                "group": "grp1",
            }
        }
        self.assertEqual(self._post_import(payload).status_code, 200)
        self.assertEqual(len(created), 1)
        self.assertEqual(len(created[0]["Files"]), 2)

    def test_import_selected_preprocessing_with_uuid_splitting(self):
        created = []
        setattr(self.mod, "create_upload_order", lambda order: created.append(order))  # type: ignore[attr-defined]
        items = [
            {"localPath": "f1.lif", "uuid": "u1"},
            {"localPath": "f2.lif", "uuid": None},
        ]
        for it in items:
            open(os.path.join(self.tmp, it["localPath"]), "w").close()
        payload = {
            "upload": {
                "selectedLocal": items,
                "selectedOmero": [("datasets", 5)],
                "group": "grp1",
            }
        }
        self.assertEqual(self._post_import(payload).status_code, 200)
        self.assertEqual(len(created), 2)
        uuid_orders = [o for o in created if any("f1.lif" in f for f in o["Files"])]
        self.assertEqual(len(uuid_orders), 1)
        self.assertIn("extra_params", uuid_orders[0])
        self.assertEqual(uuid_orders[0]["extra_params"]["image_uuid"], "u1")

    def test_import_selected_preprocessing_multiple_uuid_only(self):
        created = []
        setattr(self.mod, "create_upload_order", lambda order: created.append(order))  # type: ignore[attr-defined]
        items = [
            {"localPath": "a.lif", "uuid": "U1"},
            {"localPath": "b.lif", "uuid": "U2"},
        ]
        for it in items:
            open(os.path.join(self.tmp, it["localPath"]), "w").close()
        payload = {
            "upload": {
                "selectedLocal": items,
                "selectedOmero": [("datasets", 6)],
                "group": "grp1",
            }
        }
        self.assertEqual(self._post_import(payload).status_code, 200)
        self.assertEqual(len(created), 2)
        self.assertEqual(
            {o["extra_params"]["image_uuid"] for o in created}, {"U1", "U2"}
        )

    def test_import_selected_preprocessing_placeholder_no_uuid(self):
        created = []
        setattr(self.mod, "create_upload_order", lambda order: created.append(order))  # type: ignore[attr-defined]
        items = [
            {"localPath": "a.lif", "uuid": None},
            {"localPath": "b.lif", "uuid": None},
        ]
        for it in items:
            open(os.path.join(self.tmp, it["localPath"]), "w").close()
        payload = {
            "upload": {
                "selectedLocal": items,
                "selectedOmero": [("datasets", 7)],
                "group": "grp1",
            }
        }
        self.assertEqual(self._post_import(payload).status_code, 200)
        self.assertEqual(len(created), 1)
        self.assertNotIn("extra_params", created[0])

    def test_process_files_expands_single_nested_leica_container(self):
        created = []
        setattr(self.mod, "create_upload_order", lambda order: created.append(order))  # type: ignore[attr-defined]
        setattr(
            self.mod,
            "extract_nested_leica_items",
            lambda path: [
                {"localPath": path, "uuid": "nested-1"},
                {"localPath": path, "uuid": "nested-2"},
            ],
        )  # type: ignore[attr-defined]
        open(os.path.join(self.tmp, "nested.lif"), "w").close()

        self.mod.process_files(
            ["nested.lif"],
            [("datasets", 11)],
            "grp1",
            "alice",
        )

        self.assertEqual(len(created), 2)
        self.assertEqual(
            {order["extra_params"]["image_uuid"] for order in created},
            {"nested-1", "nested-2"},
        )

    def test_process_files_does_not_expand_selected_nested_subfile(self):
        created = []
        setattr(self.mod, "create_upload_order", lambda order: created.append(order))  # type: ignore[attr-defined]
        called = []
        setattr(
            self.mod,
            "extract_nested_leica_items",
            lambda path: called.append(path) or [{"localPath": path, "uuid": "unexpected"}],
        )  # type: ignore[attr-defined]
        open(os.path.join(self.tmp, "nested.lif"), "w").close()

        self.mod.process_files(
            [{"localPath": "nested.lif", "uuid": "already-selected"}],
            [("datasets", 12)],
            "grp1",
            "alice",
        )

        self.assertEqual(called, [])
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]["extra_params"]["image_uuid"], "already-selected")

    def test_import_selected_preprocessing_without_uuid_placeholder(self):
        self.mod.PREPROCESSING_CONFIG["screen_db"]["extra_params"] = {"saveoption": "single"}  # type: ignore[index]
        created = []
        setattr(self.mod, "create_upload_order", lambda order: created.append(order))  # type: ignore[attr-defined]
        open(os.path.join(self.tmp, "exp.db"), "w").close()
        payload = {
            "upload": {
                "selectedLocal": [{"localPath": "exp.db", "uuid": "ignore"}],
                "selectedOmero": [("screens", 4)],
                "group": "grp2",
            }
        }
        self.assertEqual(self._post_import(payload).status_code, 200)
        self.assertEqual(len(created), 1)
        self.assertNotIn("image_uuid", json.dumps(created[0].get("extra_params", {})))

    def test_import_selected_unknown_destination_type(self):
        created = []
        setattr(self.mod, "create_upload_order", lambda order: created.append(order))  # type: ignore[attr-defined]
        payload = {
            "upload": {
                "selectedLocal": ["file.txt"],
                "selectedOmero": [("weird", 1)],
                "group": "grp1",
            }
        }
        self.assertEqual(self._post_import(payload).status_code, 500)
        self.assertEqual(created, [])

    def test_create_upload_order_and_initialize_biomero_importer(self):
        # Ensure logging ingestion step increments
        from omero_biomero import importer_views as iv

        # Replace log_ingestion_step used inside importer_views with capturing stub
        calls = []

        def capturing(order, stage):  # pragma: no cover simple
            calls.append((order, stage))

        # Monkeypatch the symbol imported into module namespace
        setattr(iv, "log_ingestion_step", capturing)
        iv.create_upload_order(
            {
                "UUID": "123",
                "Files": [],
                "Group": "g",
                "Username": "u",
                "DestinationID": 1,
                "DestinationType": "Dataset",
            }
        )
        self.assertEqual(len(calls), 1)
        # initialize_biomero_importer with env
        os.environ["INGEST_TRACKING_DB_URL"] = "sqlite:///file.db"
        iv.initialize_biomero_importer()
        # remove env and call again to hit early-return branch
        del os.environ["INGEST_TRACKING_DB_URL"]
        iv.initialize_biomero_importer()

    # group_mappings
    def test_group_mappings_get_empty(self):
        cfg = os.path.join(self.tmp, "group-mappings.json")
        setattr(self.mod, "GROUP_MAPPINGS_FILE_PATH", cfg)  # type: ignore[attr-defined]
        req = self.factory.get("/importer/group_mappings")
        resp = _raw(self.mod.group_mappings)(req, conn=self.conn)
        self.assertEqual(json.loads(resp.content)["mappings"], {})

    def test_group_mappings_post_and_get(self):
        cfg = os.path.join(self.tmp, "group-mappings.json")
        setattr(self.mod, "GROUP_MAPPINGS_FILE_PATH", cfg)  # type: ignore[attr-defined]
        non_admin = self._fake_conn(["grp1"], admin=False)
        bad = self.factory.post(
            "/importer/group_mappings",
            data=json.dumps({"mappings": {"a": "b"}}),
            content_type="application/json",
        )
        self.assertEqual(
            _raw(self.mod.group_mappings)(bad, conn=non_admin).status_code, 403
        )
        good = self.factory.post(
            "/importer/group_mappings",
            data=json.dumps({"mappings": {"g1": "labA", "g2": "labB"}}),
            content_type="application/json",
        )
        self.assertEqual(
            _raw(self.mod.group_mappings)(good, conn=self.conn).status_code, 200
        )
        get_req = self.factory.get("/importer/group_mappings")
        got = _raw(self.mod.group_mappings)(get_req, conn=self.conn)
        self.assertEqual(
            json.loads(got.content)["mappings"], {"g1": "labA", "g2": "labB"}
        )

    def test_group_mappings_post_invalid_json(self):
        cfg = os.path.join(self.tmp, "group-mappings.json")
        setattr(self.mod, "GROUP_MAPPINGS_FILE_PATH", cfg)  # type: ignore[attr-defined]
        bad = self.factory.generic(
            "POST",
            "/importer/group_mappings",
            data=b"{not json}",
            content_type="application/json",
        )
        resp = _raw(self.mod.group_mappings)(bad, conn=self.conn)
        self.assertEqual(resp.status_code, 400)


class ImportUploadedFileTests(TestCase):
    """Tests for import_uploaded_file endpoint."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        _ensure_stubs()

    def setUp(self):
        self.tmp = os.path.abspath(self._mk_tmp())
        self.tus_dest = os.path.join(self.tmp, "tus_destination")
        self.config_path = os.path.join(self.tmp, "importer-config.json")
        self.group_mappings_path = os.path.join(self.tmp, "group-mappings.json")
        os.makedirs(self.tus_dest, exist_ok=True)

        _INGEST_LOG.clear()
        self.factory = RequestFactory()
        self.mod = _import_module()

        # Patch TUS destination directory
        setattr(self.mod, "UPLOADER_DESTINATION_DIR", self.tus_dest)
        setattr(self.mod, "BASE_DIR", self.tmp)
        setattr(self.mod, "CONFIG_FILE_PATH", self.config_path)
        setattr(self.mod, "GROUP_MAPPINGS_FILE_PATH", self.group_mappings_path)

        # Mock process_files to avoid actual import
        self._original_process_files = getattr(self.mod, "process_files", None)
        self._process_files_calls = []

        def mock_process_files(items, destinations, group, username):
            self._process_files_calls.append(
                {
                    "items": items,
                    "destinations": destinations,
                    "group": group,
                    "username": username,
                }
            )

        setattr(self.mod, "process_files", mock_process_files)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)
        if self._original_process_files:
            setattr(self.mod, "process_files", self._original_process_files)

    def _mk_tmp(self):
        return tempfile.mkdtemp(prefix="test_importer_upload_")

    def _fake_conn(self, groups, admin=False, user_id=5, username="alice"):
        user = MagicMock()
        user.getName.return_value = username
        user.getId.return_value = user_id
        grp_objs = []
        for g in groups:
            go = MagicMock()
            go.getName.return_value = g
            go.getId.return_value = hash(g) % 1000  # Simple ID generation
            grp_objs.append(go)
        conn = MagicMock()
        conn.getUser.return_value = user
        conn.getGroupsMemberOf.return_value = grp_objs
        conn.isAdmin.return_value = admin

        # Mock getGroupFromContext
        current_grp = MagicMock()
        current_grp.getName.return_value = groups[0] if groups else "default"
        conn.getGroupFromContext.return_value = current_grp

        return conn

    def _create_test_file(self, filename, user_id=5, content=b"test content"):
        """Create a test file in user-specific TUS destination."""
        user_dir = os.path.join(self.tus_dest, f"user_{user_id}")
        os.makedirs(user_dir, exist_ok=True)
        file_path = os.path.join(user_dir, filename)
        with open(file_path, "wb") as f:
            f.write(content)
        return file_path

    def _create_legacy_file(self, filename, content=b"test content"):
        """Create a test file in legacy location (without user subdirectory)."""
        file_path = os.path.join(self.tus_dest, filename)
        with open(file_path, "wb") as f:
            f.write(content)
        return file_path

    def _create_group_folder_upload_file(
        self, filename, group_folder, username="alice", content=b"test content"
    ):
        uploads_dir = os.path.join(self.tmp, group_folder, "uploads", username)
        os.makedirs(uploads_dir, exist_ok=True)
        file_path = os.path.join(uploads_dir, filename)
        with open(file_path, "wb") as f:
            f.write(content)
        return file_path

    def _write_uploader_config(self, upload_to_group_folder=False):
        with open(self.config_path, "w", encoding="utf-8") as fh:
            json.dump(
                {"UPLOADER": {"upload_to_group_folder": upload_to_group_folder}},
                fh,
            )

    def _write_group_mappings(self, mappings):
        with open(self.group_mappings_path, "w", encoding="utf-8") as fh:
            json.dump(mappings, fh)

    def _call_import(self, data, conn):
        """Call import_uploaded_file with given data."""
        req = self.factory.post(
            "/api/importer/import_uploaded_file/",
            data=json.dumps(data),
            content_type="application/json",
        )
        return _raw(self.mod.import_uploaded_file)(req, conn=conn)

    # Basic validation tests
    def test_missing_filename(self):
        """Should reject request without filename."""
        conn = self._fake_conn(["grp1"])
        resp = self._call_import({"datasetId": 123}, conn)

        self.assertEqual(resp.status_code, 400)
        self.assertIn("No filename provided", resp.content.decode())

    def test_missing_dataset_id(self):
        """Should reject request without datasetId."""
        conn = self._fake_conn(["grp1"])
        resp = self._call_import({"filename": "test.tif"}, conn)

        self.assertEqual(resp.status_code, 400)
        self.assertIn("No dataset ID provided", resp.content.decode())

    def test_file_not_found(self):
        """Should return 404 if file doesn't exist."""
        conn = self._fake_conn(["grp1"])
        resp = self._call_import(
            {
                "filename": "nonexistent.tif",
                "datasetId": 123,
            },
            conn,
        )

        self.assertEqual(resp.status_code, 404)
        self.assertIn("File not found", resp.content.decode())

    def test_import_uploaded_file_finds_group_folder_upload(self):
        self._write_uploader_config(upload_to_group_folder=True)
        conn = self._fake_conn(["grp1"], user_id=5, username="alice")
        group_id = conn.getGroupsMemberOf.return_value[0].getId.return_value
        self._write_group_mappings(
            {str(group_id): {"folder": "grp1-folder", "groupName": "grp1"}}
        )
        self._create_group_folder_upload_file(
            "group-upload.tif", "grp1-folder", username="alice"
        )

        dataset = MagicMock()
        dataset.canLink.return_value = True
        conn.getObject.return_value = dataset

        resp = self._call_import(
            {
                "filename": "group-upload.tif",
                "datasetId": 123,
                "datasetType": "Dataset",
                "group": "grp1",
            },
            conn,
        )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(self._process_files_calls), 1)
        self.assertEqual(
            self._process_files_calls[0]["items"],
            [
                os.path.join(
                    self.tmp,
                    "grp1-folder",
                    "uploads",
                    "alice",
                    "group-upload.tif",
                )
            ],
        )

    def test_import_uploaded_file_finds_group_folder_upload_by_group_id(self):
        self._write_uploader_config(upload_to_group_folder=True)
        conn = self._fake_conn(["grp1"], user_id=5, username="alice")
        group_id = conn.getGroupsMemberOf.return_value[0].getId.return_value
        self._write_group_mappings(
            {str(group_id): {"folder": "grp1-folder", "groupName": "grp1"}}
        )
        self._create_group_folder_upload_file(
            "group-upload-id.tif", "grp1-folder", username="alice"
        )

        dataset = MagicMock()
        dataset.canLink.return_value = True
        conn.getObject.return_value = dataset

        resp = self._call_import(
            {
                "filename": "group-upload-id.tif",
                "datasetId": 123,
                "datasetType": "Dataset",
                "groupId": group_id,
            },
            conn,
        )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(self._process_files_calls), 1)
        self.assertEqual(
            self._process_files_calls[0]["items"],
            [
                os.path.join(
                    self.tmp,
                    "grp1-folder",
                    "uploads",
                    "alice",
                    "group-upload-id.tif",
                )
            ],
        )

    def test_invalid_json(self):
        """Should handle invalid JSON gracefully."""
        conn = self._fake_conn(["grp1"])
        req = self.factory.post(
            "/api/importer/import_uploaded_file/",
            data=b"{invalid json}",
            content_type="application/json",
        )
        resp = _raw(self.mod.import_uploaded_file)(req, conn=conn)

        self.assertEqual(resp.status_code, 400)

    # File location tests
    def test_import_from_user_directory(self):
        """Should find file in user-specific directory."""
        user_id = 42
        filename = "user_file.tif"
        self._create_test_file(filename, user_id=user_id)

        conn = self._fake_conn(["grp1"], user_id=user_id)

        # Mock dataset access
        dataset = MagicMock()
        dataset.canLink.return_value = True
        conn.getObject.return_value = dataset

        resp = self._call_import(
            {
                "filename": filename,
                "datasetId": 123,
                "datasetType": "Dataset",
            },
            conn,
        )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(self._process_files_calls), 1)

    def test_import_from_legacy_directory(self):
        """Should find file in legacy directory for backwards compatibility."""
        user_id = 42
        filename = "legacy_file.tif"
        self._create_legacy_file(filename)

        conn = self._fake_conn(["grp1"], user_id=user_id)

        # Mock dataset access
        dataset = MagicMock()
        dataset.canLink.return_value = True
        conn.getObject.return_value = dataset

        resp = self._call_import(
            {
                "filename": filename,
                "datasetId": 123,
                "datasetType": "Dataset",
            },
            conn,
        )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(self._process_files_calls), 1)

    def test_user_directory_takes_precedence(self):
        """User directory should be checked before legacy directory."""
        user_id = 42
        filename = "both_locations.tif"

        # Create file in both locations with different content
        self._create_test_file(filename, user_id=user_id, content=b"user content")
        self._create_legacy_file(filename, content=b"legacy content")

        conn = self._fake_conn(["grp1"], user_id=user_id)

        # Mock dataset access
        dataset = MagicMock()
        dataset.canLink.return_value = True
        conn.getObject.return_value = dataset

        resp = self._call_import(
            {
                "filename": filename,
                "datasetId": 123,
                "datasetType": "Dataset",
            },
            conn,
        )

        self.assertEqual(resp.status_code, 200)
        # Verify the user-specific path was used
        call = self._process_files_calls[0]
        self.assertIn(f"user_{user_id}", call["items"][0])

    # Authorization tests
    def test_group_not_member(self):
        """Should reject if user not member of requested group."""
        user_id = 42
        filename = "test.tif"
        self._create_test_file(filename, user_id=user_id)

        conn = self._fake_conn(["grp1", "grp2"], user_id=user_id)

        resp = self._call_import(
            {
                "filename": filename,
                "datasetId": 123,
                "group": "grp_not_member",
            },
            conn,
        )

        self.assertEqual(resp.status_code, 403)
        self.assertIn("not a member of group", resp.content.decode())

    def test_dataset_not_found(self):
        """Should return 404 if dataset doesn't exist."""
        user_id = 42
        filename = "test.tif"
        self._create_test_file(filename, user_id=user_id)

        conn = self._fake_conn(["grp1"], user_id=user_id)
        conn.getObject.return_value = None  # Dataset not found

        resp = self._call_import(
            {
                "filename": filename,
                "datasetId": 999,
                "datasetType": "Dataset",
            },
            conn,
        )

        self.assertEqual(resp.status_code, 404)
        self.assertIn("not found", resp.content.decode())

    def test_dataset_no_write_permission(self):
        """Should reject if user cannot link to dataset."""
        user_id = 42
        filename = "test.tif"
        self._create_test_file(filename, user_id=user_id)

        conn = self._fake_conn(["grp1"], user_id=user_id)

        # Mock dataset without link permission
        dataset = MagicMock()
        dataset.canLink.return_value = False
        conn.getObject.return_value = dataset

        resp = self._call_import(
            {
                "filename": filename,
                "datasetId": 123,
                "datasetType": "Dataset",
            },
            conn,
        )

        self.assertEqual(resp.status_code, 403)
        self.assertIn("permission", resp.content.decode())

    def test_project_not_found(self):
        """Should return 404 if project doesn't exist."""
        user_id = 42
        filename = "test.tif"
        self._create_test_file(filename, user_id=user_id)

        conn = self._fake_conn(["grp1"], user_id=user_id)
        conn.getObject.return_value = None  # Project not found

        resp = self._call_import(
            {
                "filename": filename,
                "datasetId": 999,
                "datasetType": "Project",
            },
            conn,
        )

        self.assertEqual(resp.status_code, 404)
        self.assertIn("not found", resp.content.decode())

    def test_project_no_write_permission(self):
        """Should reject if user cannot link to project."""
        user_id = 42
        filename = "test.tif"
        self._create_test_file(filename, user_id=user_id)

        conn = self._fake_conn(["grp1"], user_id=user_id)

        # Mock project without link permission
        project = MagicMock()
        project.canLink.return_value = False
        conn.getObject.return_value = project

        resp = self._call_import(
            {
                "filename": filename,
                "datasetId": 123,
                "datasetType": "Project",
            },
            conn,
        )

        self.assertEqual(resp.status_code, 403)
        self.assertIn("permission", resp.content.decode())

    # Success path tests
    def test_successful_import_to_dataset(self):
        """Should successfully queue file for import to dataset."""
        user_id = 42
        filename = "success.tif"
        self._create_test_file(filename, user_id=user_id)

        conn = self._fake_conn(["grp1"], user_id=user_id, username="testuser")

        # Mock dataset with write permission
        dataset = MagicMock()
        dataset.canLink.return_value = True
        conn.getObject.return_value = dataset

        resp = self._call_import(
            {
                "filename": filename,
                "datasetId": 123,
                "datasetType": "Dataset",
                "group": "grp1",
            },
            conn,
        )

        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.content)
        self.assertEqual(data["status"], "success")

        # Verify process_files was called correctly
        self.assertEqual(len(self._process_files_calls), 1)
        call = self._process_files_calls[0]
        self.assertEqual(call["destinations"], [["Dataset", 123]])
        self.assertEqual(call["group"], "grp1")
        self.assertEqual(call["username"], "testuser")

    def test_successful_import_default_group(self):
        """Should use current context group if not specified."""
        user_id = 42
        filename = "default_group.tif"
        self._create_test_file(filename, user_id=user_id)

        conn = self._fake_conn(["grp1", "grp2"], user_id=user_id)

        # Mock dataset with write permission
        dataset = MagicMock()
        dataset.canLink.return_value = True
        conn.getObject.return_value = dataset

        resp = self._call_import(
            {
                "filename": filename,
                "datasetId": 123,
                "datasetType": "Dataset",
                # No group specified
            },
            conn,
        )

        self.assertEqual(resp.status_code, 200)

        # Should use first group (from getGroupFromContext mock)
        call = self._process_files_calls[0]
        self.assertEqual(call["group"], "grp1")

    def test_different_users_same_filename(self):
        """Different users should have isolated file namespaces."""
        filename = "same_name.tif"

        # Create files for two different users
        self._create_test_file(filename, user_id=1, content=b"user1 content")
        self._create_test_file(filename, user_id=2, content=b"user2 content")

        # User 1 imports their file
        conn1 = self._fake_conn(["grp1"], user_id=1, username="user1")
        dataset1 = MagicMock()
        dataset1.canLink.return_value = True
        conn1.getObject.return_value = dataset1

        resp1 = self._call_import(
            {
                "filename": filename,
                "datasetId": 100,
                "datasetType": "Dataset",
            },
            conn1,
        )
        self.assertEqual(resp1.status_code, 200)

        # User 2 imports their file
        conn2 = self._fake_conn(["grp1"], user_id=2, username="user2")
        dataset2 = MagicMock()
        dataset2.canLink.return_value = True
        conn2.getObject.return_value = dataset2

        resp2 = self._call_import(
            {
                "filename": filename,
                "datasetId": 200,
                "datasetType": "Dataset",
            },
            conn2,
        )
        self.assertEqual(resp2.status_code, 200)

        # Verify both imports used different paths
        self.assertEqual(len(self._process_files_calls), 2)
        self.assertIn("user_1", self._process_files_calls[0]["items"][0])
        self.assertIn("user_2", self._process_files_calls[1]["items"][0])
