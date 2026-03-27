import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import TestCase


def _raw(func_name):
    from omero_biomero import prediction_views as pv

    fn = getattr(pv, func_name)
    while hasattr(fn, "__wrapped__"):
        fn = fn.__wrapped__
    return fn


class StubFile:
    def __init__(self, name, file_id):
        self._name = name
        self._id = file_id
        self.saved = False

    def getName(self):
        return self._name

    def setName(self, name):
        self._name = name

    def save(self):
        self.saved = True

    def getId(self):
        return self._id


class StubFileAnnotationWrapper:
    def __init__(self, ann_id, name, payload=None, ns="biomero.prediction.annotations", description=""):
        self._id = ann_id
        self._file = StubFile(name, ann_id + 1000)
        self._payload = payload or {}
        self._ns = ns
        self._description = description

    def getId(self):
        return self._id

    def getFile(self):
        return self._file

    def getFileInChunks(self):
        return [json.dumps(self._payload).encode("utf-8")]

    def getNs(self):
        return self._ns

    def getDescription(self):
        return self._description


class PredictionViewsTests(TestCase):
    def _make_conn(self, dataset):
        conn = MagicMock()
        conn.getObject.return_value = dataset
        conn.SERVICE_OPTS = MagicMock()
        return conn

    def _make_dataset(self, annotations):
        dataset = MagicMock()
        dataset.listAnnotations.return_value = annotations
        dataset.getDetails.return_value.getGroup.return_value.getId.return_value = 17
        return dataset

    def test_list_annotation_sets_returns_dataset_linked_sets(self):
        view = _raw("list_annotation_sets")
        dataset = self._make_dataset(
            [
                StubFileAnnotationWrapper(5, "ignore.json", ns="other.namespace"),
                StubFileAnnotationWrapper(
                    7,
                    "first.json",
                    payload={
                        "name": "Set A",
                        "description": "first",
                        "datasetId": "12",
                        "patches": [{"id": "p1", "imageId": "21", "x": 0, "y": 0, "width": 256, "height": 256}],
                        "annotations": [{"id": "a1", "imageId": "21"}],
                    },
                ),
                StubFileAnnotationWrapper(
                    9,
                    "second.json",
                    payload={
                        "name": "Set B",
                        "description": "second",
                        "datasetId": "12",
                        "patches": [{"id": "p2", "imageId": "21", "x": 10, "y": 10, "width": 256, "height": 256}],
                        "annotations": [
                            {"id": "a2", "imageId": "21"},
                            {"id": "a3", "imageId": "22"},
                        ],
                    },
                ),
            ]
        )
        request = SimpleNamespace(method="GET", GET={"dataset": "12"})

        with patch(
            "omero_biomero.prediction_views.omero.gateway.FileAnnotationWrapper",
            StubFileAnnotationWrapper,
        ):
            response = view(request, conn=self._make_conn(dataset))

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual([item["id"] for item in data["annotationSets"]], [9, 7])
        self.assertEqual(data["annotationSets"][0]["patchCount"], 1)
        self.assertEqual(data["annotationSets"][0]["imageCount"], 2)
        self.assertEqual(data["annotationSets"][0]["annotationCount"], 2)

    def test_fetch_annotations_returns_selected_dataset_annotation_set(self):
        view = _raw("fetch_annotations")
        dataset = self._make_dataset(
            [
                StubFileAnnotationWrapper(
                    11,
                    "set.json",
                    payload={
                        "name": "Training Set",
                        "description": "main set",
                        "datasetId": "12",
                        "patches": [{"id": "p-1", "imageId": "31", "x": 4, "y": 8, "width": 256, "height": 256}],
                        "featureTypes": [{"id": "1", "name": "Cell", "color": "#00ff00"}],
                        "annotations": [
                            {"id": "ann-1", "imageId": "31", "patchId": "p-1", "points": [[0, 0], [1, 1]], "typeId": "1"}
                        ],
                    },
                )
            ]
        )
        request = SimpleNamespace(method="GET", GET={"dataset": "12", "annotation": "11"})

        with patch(
            "omero_biomero.prediction_views.omero.gateway.FileAnnotationWrapper",
            StubFileAnnotationWrapper,
        ):
            response = view(request, conn=self._make_conn(dataset))

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data["annotationSetId"], 11)
        self.assertEqual(data["name"], "Training Set")
        self.assertEqual(data["patches"][0]["id"], "p-1")
        self.assertEqual(data["annotations"][0]["patchId"], "p-1")
        self.assertEqual(data["annotations"][0]["imageId"], "31")

    def test_save_annotations_replaces_existing_dataset_annotation_set(self):
        view = _raw("save_annotations")
        existing = StubFileAnnotationWrapper(
            11,
            "existing.json",
            payload={"name": "Old", "datasetId": "12", "annotations": []},
        )
        dataset = self._make_dataset([existing])
        conn = self._make_conn(dataset)
        created = StubFileAnnotationWrapper(22, "created.json")
        conn.createFileAnnfromLocalFile.return_value = created

        payload = {
            "datasetId": "12",
            "annotationId": "11",
            "data": {
                "name": "Updated Set",
                "description": "refined masks",
                "patches": [
                    {"id": "patch-1", "imageId": "31", "x": 0, "y": 0, "width": 256, "height": 256}
                ],
                "featureTypes": [{"id": "1", "name": "Cell", "color": "#00ff00"}],
                "annotations": [
                    {
                        "id": "ann-1",
                        "imageId": "31",
                        "patchId": "patch-1",
                        "points": [[0, 0], [1, 1]],
                        "typeId": "1",
                    }
                ],
            },
        }
        request = SimpleNamespace(
            method="POST",
            body=json.dumps(payload).encode("utf-8"),
            content_type="application/json",
        )

        with patch(
            "omero_biomero.prediction_views.omero.gateway.FileAnnotationWrapper",
            StubFileAnnotationWrapper,
        ):
            response = view(request, conn=conn)

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data["annotationSetId"], 22)
        self.assertEqual(data["annotationSet"]["name"], "Updated Set")
        self.assertEqual(data["annotationSet"]["patchCount"], 1)
        dataset.linkAnnotation.assert_called_once_with(created)
        conn.deleteObjects.assert_called_once_with("Annotation", [11])