import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pandas as pd
from django.test import TestCase


def _raw(func_name):
    from omero_biomero import annotate_ai_views as av

    fn = getattr(av, func_name)
    while hasattr(fn, "__wrapped__"):
        fn = fn.__wrapped__
    return fn


def _make_conn():
    conn = MagicMock()
    conn.SERVICE_OPTS = MagicMock()
    return conn


def _make_request(params=None):
    return SimpleNamespace(method="GET", GET=params or {})


def _make_table(train_flags, validate_flags, processed_flags):
    """Build a tracking-table DataFrame from parallel lists."""
    assert len(train_flags) == len(validate_flags) == len(processed_flags)
    return pd.DataFrame(
        {
            "image_id": list(range(len(train_flags))),
            "image_name": [f"img_{i}.tif" for i in range(len(train_flags))],
            "processed": processed_flags,
            "train": train_flags,
            "validate": validate_flags,
        }
    )


class ValidateTrainingReadinessTests(TestCase):
    def setUp(self):
        self.view = _raw("validate_training_readiness")

    # ------------------------------------------------------------------
    # Parameter validation
    # ------------------------------------------------------------------

    def test_missing_table_id_returns_400(self):
        request = _make_request()
        response = self.view(request, conn=_make_conn())
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.content)
        self.assertIn("error", data)

    # ------------------------------------------------------------------
    # Blocker: no training annotations
    # ------------------------------------------------------------------

    def test_no_training_annotations_returns_blocker(self):
        # All images are val (validate=True), none are train
        table = _make_table(
            train_flags=[False, False],
            validate_flags=[True, True],
            processed_flags=[True, True],
        )
        request = _make_request({"table_id": "42"})
        with patch("ezomero.get_table", return_value=table):
            response = self.view(request, conn=_make_conn())

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertFalse(data["ready"])
        levels = [c["level"] for c in data["checks"]]
        self.assertIn("blocker", levels)
        checks_by_check = {c["check"]: c for c in data["checks"]}
        self.assertEqual(checks_by_check["train_annotations"]["level"], "blocker")

    # ------------------------------------------------------------------
    # Blocker: no validation annotations
    # ------------------------------------------------------------------

    def test_no_validation_annotations_returns_blocker(self):
        # 6 train images processed, 2 val images exist but none processed
        table = _make_table(
            train_flags=[True] * 6,
            validate_flags=[False] * 6,
            processed_flags=[True] * 6,
        )
        # Add 2 val rows, not processed
        val_rows = pd.DataFrame(
            {
                "image_id": [100, 101],
                "image_name": ["val_0.tif", "val_1.tif"],
                "processed": [False, False],
                "train": [False, False],
                "validate": [True, True],
            }
        )
        table = pd.concat([table, val_rows], ignore_index=True)
        request = _make_request({"table_id": "42"})
        with patch("ezomero.get_table", return_value=table):
            response = self.view(request, conn=_make_conn())

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertFalse(data["ready"])
        checks_by_check = {c["check"]: c for c in data["checks"]}
        self.assertEqual(checks_by_check["val_annotations"]["level"], "blocker")

    # ------------------------------------------------------------------
    # Warning: no test annotations (but ready=True since only a warning)
    # ------------------------------------------------------------------

    def test_no_test_annotations_returns_warning_but_ready(self):
        # 6 train + 2 val processed; 2 test images exist but none processed
        table = _make_table(
            train_flags=[True] * 6 + [False] * 2 + [False] * 2,
            validate_flags=[False] * 6 + [True] * 2 + [False] * 2,
            processed_flags=[True] * 6 + [True] * 2 + [False] * 2,
        )
        request = _make_request({"table_id": "42"})
        with patch("ezomero.get_table", return_value=table):
            response = self.view(request, conn=_make_conn())

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertTrue(data["ready"])
        checks_by_check = {c["check"]: c for c in data["checks"]}
        self.assertEqual(checks_by_check["test_annotations"]["level"], "warning")

    # ------------------------------------------------------------------
    # All splits annotated → ready
    # ------------------------------------------------------------------

    def test_all_splits_annotated_returns_ready(self):
        table = _make_table(
            train_flags=[True] * 6 + [False] * 2 + [False] * 2,
            validate_flags=[False] * 6 + [True] * 2 + [False] * 2,
            processed_flags=[True] * 10,
        )
        request = _make_request({"table_id": "42"})
        with patch("ezomero.get_table", return_value=table):
            response = self.view(request, conn=_make_conn())

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertTrue(data["ready"])
        levels = [c["level"] for c in data["checks"]]
        self.assertNotIn("blocker", levels)

    # ------------------------------------------------------------------
    # Warning: fewer than 5 training images annotated
    # ------------------------------------------------------------------

    def test_few_training_images_returns_warning(self):
        # Only 3 train images processed (< 5 threshold)
        table = _make_table(
            train_flags=[True] * 3 + [False] * 2,
            validate_flags=[False] * 3 + [True] * 2,
            processed_flags=[True] * 3 + [True] * 2,
        )
        request = _make_request({"table_id": "42"})
        with patch("ezomero.get_table", return_value=table):
            response = self.view(request, conn=_make_conn())

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        checks_by_check = {c["check"]: c for c in data["checks"]}
        self.assertEqual(checks_by_check["train_count"]["level"], "warning")

    # ------------------------------------------------------------------
    # Summary counts
    # ------------------------------------------------------------------

    def test_summary_counts_are_correct(self):
        # 6 train (4 processed), 2 val (2 processed), 2 test (1 processed)
        table = _make_table(
            train_flags=[True] * 6 + [False] * 2 + [False] * 2,
            validate_flags=[False] * 6 + [True] * 2 + [False] * 2,
            processed_flags=[True] * 4 + [False] * 2 + [True] * 2 + [True, False],
        )
        request = _make_request({"table_id": "42"})
        with patch("ezomero.get_table", return_value=table):
            response = self.view(request, conn=_make_conn())

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        s = data["summary"]
        self.assertEqual(s["train_total"], 6)
        self.assertEqual(s["train_done"], 4)
        self.assertEqual(s["val_total"], 2)
        self.assertEqual(s["val_done"], 2)
        self.assertEqual(s["test_total"], 2)
        self.assertEqual(s["test_done"], 1)

    # ------------------------------------------------------------------
    # Table not found
    # ------------------------------------------------------------------

    def test_table_not_found_returns_404(self):
        request = _make_request({"table_id": "99"})
        with patch("ezomero.get_table", return_value=None):
            response = self.view(request, conn=_make_conn())

        self.assertEqual(response.status_code, 404)
