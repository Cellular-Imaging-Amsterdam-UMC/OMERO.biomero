import os
import sys
import types
import jwt
from unittest.mock import MagicMock, patch
from django.test import TestCase


def _ensure_stubs():
    if "omeroweb.webclient.decorators" not in sys.modules:
        sys.modules.setdefault("omeroweb", types.ModuleType("omeroweb"))
        sys.modules.setdefault(
            "omeroweb.webclient", types.ModuleType("omeroweb.webclient")
        )
        decorators = types.ModuleType("omeroweb.webclient.decorators")

        def login_required(*d, **k):
            def deco(fn):
                return fn

            return deco

        def render_response(*d, **k):
            def deco(fn):
                def wrapper(*a, **kw):
                    return fn(*a, **kw)

                return wrapper

            return deco

        setattr(decorators, "login_required", login_required)
        setattr(decorators, "render_response", render_response)
        sys.modules["omeroweb.webclient.decorators"] = decorators


def _raw_biomero():
    from omero_biomero import biomero_views

    fn = biomero_views.biomero
    # Unwrap stacked decorators (login_required, render_response)
    while hasattr(fn, "__wrapped__"):
        fn = fn.__wrapped__
    return fn


class BiomeroViewTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        _ensure_stubs()

    def _fake_conn(self, user_id=5, username="alice", is_admin=True):
        user = MagicMock()
        user.getName.return_value = username
        user.getId.return_value = user_id
        conn = MagicMock()
        conn.getUser.return_value = user
        conn.isAdmin.return_value = is_admin
        return conn

    def test_biomero_context_basic(self):
        env = {
            "IMPORTER_ENABLED": "true",
            "ANALYZER_ENABLED": "false",
        }
        with patch.dict(os.environ, env, clear=False), patch(
            "omero_biomero.biomero_views.get_react_build_file",
            side_effect=lambda n: f"hashed-{n}",
        ):
            ctx = _raw_biomero()(None, conn=self._fake_conn())

        self.assertEqual(ctx["metabase_site_url"], "")
        self.assertEqual(ctx["metabase_token_monitor_workflows"], "")
        self.assertEqual(ctx["metabase_token_imports"], "")
        self.assertTrue(ctx["importer_enabled"])  # true parsed
        self.assertFalse(ctx["analyzer_enabled"])  # false parsed
        self.assertEqual(ctx["main_js"], "hashed-main.js")
        self.assertEqual(ctx["main_css"], "hashed-main.css")
        self.assertIn(".lif", ctx["uploader_allowed_file_extensions"])
        self.assertNotIn(".xlef", ctx["uploader_allowed_file_extensions"])

    def test_biomero_missing_env_defaults(self):
        with patch.dict(
            os.environ,
            {},
            clear=True,
        ), patch(
            "omero_biomero.biomero_views.get_react_build_file",
            return_value="fallback.js",
        ):
            ctx = _raw_biomero()(None, conn=self._fake_conn())
        self.assertEqual(ctx["main_js"], "fallback.js")
        self.assertTrue(ctx["importer_enabled"])  # default True
        self.assertTrue(ctx["analyzer_enabled"])  # default True

    def test_biomero_build_file_fallback(self):
        with patch.dict(
            os.environ,
            {},
            clear=True,
        ):
            ctx = _raw_biomero()(None, conn=self._fake_conn())
        self.assertTrue(
            ctx["main_js"].startswith("omero_biomero/assets/main.")
            and ctx["main_js"].endswith(".js")
            or ctx["main_js"] == "main.js"
        )

    @patch("omero_biomero.biomero_views.psycopg2.connect")
    def test_metabase_data_imports(self, mock_connect):
        from omero_biomero.biomero_views import metabase_data
        from django.test import RequestFactory
        import datetime

        # Mock database connection and cursor
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_connect.return_value.__enter__.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        # Fake rows returned from imports SQL query
        fake_rows = [
            (
                '["file1.lif"]',
                "Import Completed",
                "101",
                "some-uuid-1",
                datetime.datetime(2026, 6, 9, 10, 0, 0),
                "10 seconds",
                "group1",
                "alice",
                None,
                "Dataset"
            )
        ]
        mock_cursor.fetchall.return_value = fake_rows

        rf = RequestFactory()
        req = rf.get('/biomero/metabase_data/', {'dashboard_type': 'imports'})
        
        with patch.dict(os.environ, {"INGEST_TRACKING_DB_URL": "postgresql://user:pass@host/db"}):
            resp = metabase_data(req, conn=self._fake_conn(username="alice"))

        self.assertEqual(resp.status_code, 200)
        import json
        data = json.loads(resp.content.decode("utf-8"))["data"]
        self.assertEqual(data["total_rows"], 1)
        self.assertEqual(data["rows"][0][3], "some-uuid-1")
        self.assertEqual(data["rows"][0][4], "2026-06-09T10:00:00")
        self.assertEqual(data["cols"][0]["name"], "file_names")

    @patch("omero_biomero.biomero_views.psycopg2.connect")
    def test_metabase_data_imports_applies_parameterized_date_filter(self, mock_connect):
        from datetime import datetime, timezone
        from django.test import RequestFactory
        from omero_biomero.biomero_views import metabase_data

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_connect.return_value.__enter__.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        mock_cursor.fetchall.return_value = []

        req = RequestFactory().get(
            "/biomero/metabase_data/",
            {
                "dashboard_type": "imports",
                "date_from": "2026-07-16T00:00:00Z",
                "date_to": "2026-07-17T00:00:00Z",
                "date_mode": "exclude",
            },
        )

        with patch.dict(
            os.environ,
            {"INGEST_TRACKING_DB_URL": "postgresql://user:pass@host/db"},
        ):
            resp = metabase_data(req, conn=self._fake_conn(username="alice"))

        self.assertEqual(resp.status_code, 200)
        query, params = mock_cursor.execute.call_args.args
        self.assertIn("NOT (ft.last_timestamp >= %s", query)
        self.assertEqual(params[0], "alice")
        self.assertEqual(params[1], datetime(2026, 7, 16, tzinfo=timezone.utc))
        self.assertEqual(params[2], datetime(2026, 7, 17, tzinfo=timezone.utc))

    @patch("omero_biomero.biomero_views.psycopg2.connect")
    def test_metabase_data_imports_resolves_visible_file_targets(
        self, mock_connect
    ):
        import datetime
        import json
        from django.test import RequestFactory
        from omero.rtypes import unwrap
        from omero_biomero.biomero_views import metabase_data

        db_conn = MagicMock()
        cursor = MagicMock()
        mock_connect.return_value.__enter__.return_value = db_conn
        db_conn.cursor.return_value.__enter__.return_value = cursor
        cursor.fetchall.return_value = [
            (
                '["file1.lif"]',
                "Import Completed",
                "101",
                "visible-uuid",
                datetime.datetime(2026, 6, 9, 10),
                "10 seconds",
                "group1",
                "alice",
                None,
                "Dataset",
            ),
            (
                '["file2.lif"]',
                "Import Completed",
                "102",
                "hidden-uuid",
                datetime.datetime(2026, 6, 8, 10),
                "10 seconds",
                "group1",
                "alice",
                None,
                "Dataset",
            ),
        ]

        conn = self._fake_conn(username="alice")
        query_service = conn.getQueryService.return_value
        query_service.projection.side_effect = [
            [["visible-uuid", 1251, "file1.lif", "/data/file1.lif"]],
            [],
        ]
        request = RequestFactory().get(
            "/biomero/metabase_data/",
            {"dashboard_type": "imports", "page": 1, "limit": 1},
        )

        with patch.dict(
            os.environ,
            {"INGEST_TRACKING_DB_URL": "postgresql://user:pass@host/db"},
        ):
            response = metabase_data(request, conn=conn)

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content.decode("utf-8"))["data"]
        self.assertEqual(data["cols"][-1]["name"], "file_targets")
        self.assertEqual(data["rows"][0][-1], {"file1.lif": ["image-1251"]})
        self.assertEqual(query_service.projection.call_count, 2)
        _, params, _ = query_service.projection.call_args_list[0].args
        self.assertEqual(unwrap(params.map["uuids"]), ["visible-uuid"])

    @patch("omero_biomero.biomero_views.psycopg2.connect")
    def test_metabase_data_imports_rejects_invalid_date_filter(self, mock_connect):
        from django.test import RequestFactory
        from omero_biomero.biomero_views import metabase_data

        req = RequestFactory().get(
            "/biomero/metabase_data/",
            {
                "dashboard_type": "imports",
                "date_from": "not-a-date",
                "date_to": "2026-07-17T00:00:00Z",
            },
        )

        resp = metabase_data(req, conn=self._fake_conn(username="alice"))

        self.assertEqual(resp.status_code, 400)
        mock_connect.assert_not_called()

    @patch("omero_biomero.biomero_views.psycopg2.connect")
    def test_metabase_data_workflows(self, mock_connect):
        from omero_biomero.biomero_views import metabase_data
        from django.test import RequestFactory
        import datetime

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_connect.return_value.__enter__.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor

        # Fake rows returned from workflows SQL query
        # Columns: workflow_id, name, main_task_name, status, progress, start_time, task, group, user
        fake_rows = [
            (
                "wf-uuid-1",
                "Workflow 1",
                "Task A",
                "Running",
                50.0,
                datetime.datetime(2026, 6, 9, 10, 5, 0),
                "subtask 1",
                "group1",
                5
            )
        ]
        mock_cursor.fetchall.return_value = fake_rows

        rf = RequestFactory()
        req = rf.get('/biomero/metabase_data/', {'dashboard_type': 'workflows'})
        
        with patch.dict(os.environ, {"INGEST_TRACKING_DB_URL": "postgresql://user:pass@host/db"}):
            resp = metabase_data(req, conn=self._fake_conn(user_id=5))

        self.assertEqual(resp.status_code, 200)
        import json
        data = json.loads(resp.content.decode("utf-8"))["data"]
        self.assertEqual(data["total_rows"], 1)
        self.assertEqual(data["rows"][0][0], "wf-uuid-1")
        self.assertEqual(data["rows"][0][5], "2026-06-09T10:05:00")
        self.assertEqual(data["cols"][0]["name"], "workflow_id")

    @patch("omero_biomero.biomero_views.psycopg2.connect")
    def test_metabase_data_workflows_applies_date_filter(self, mock_connect):
        from datetime import datetime, timezone
        from django.test import RequestFactory
        from omero_biomero.biomero_views import metabase_data

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_connect.return_value.__enter__.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
        mock_cursor.fetchall.return_value = []

        req = RequestFactory().get(
            "/biomero/metabase_data/",
            {
                "dashboard_type": "workflows",
                "date_from": "2026-07-16T00:00:00Z",
                "date_to": "2026-07-17T00:00:00Z",
                "date_mode": "include",
            },
        )

        with patch.dict(
            os.environ,
            {"INGEST_TRACKING_DB_URL": "postgresql://user:pass@host/db"},
        ):
            resp = metabase_data(req, conn=self._fake_conn(user_id=5))

        self.assertEqual(resp.status_code, 200)
        query, params = mock_cursor.execute.call_args.args
        self.assertIn("start_time >= %s", query)
        self.assertEqual(params[0], 5)
        self.assertEqual(params[1], datetime(2026, 7, 16, tzinfo=timezone.utc))
        self.assertEqual(params[2], datetime(2026, 7, 17, tzinfo=timezone.utc))

    def test_metabase_data_invalid_type(self):
        from omero_biomero.biomero_views import metabase_data
        from django.test import RequestFactory

        rf = RequestFactory()
        req = rf.get('/biomero/metabase_data/', {'dashboard_type': 'invalid'})
        resp = metabase_data(req, conn=self._fake_conn())
        self.assertEqual(resp.status_code, 400)

    def test_metabase_data_missing_db_url(self):
        from omero_biomero.biomero_views import metabase_data
        from django.test import RequestFactory

        rf = RequestFactory()
        req = rf.get('/biomero/metabase_data/', {'dashboard_type': 'imports'})
        
        with patch.dict(os.environ, {}, clear=True):
            resp = metabase_data(req, conn=self._fake_conn())
        self.assertEqual(resp.status_code, 500)
