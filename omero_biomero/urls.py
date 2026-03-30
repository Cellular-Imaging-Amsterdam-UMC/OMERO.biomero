from django.urls import path
from .tus_views import TusUploadView
from . import biomero_views, importer_views, admin_views, analyzer_views, prediction_views

urlpatterns = [
    # Importer URLs
    path(
        "api/importer/import_selected/",
        importer_views.import_selected,
        name="import_selected",
    ),
    path(
        "api/importer/import_uploaded_file/",
        importer_views.import_uploaded_file,
        name="import_uploaded_file",
    ),
    path(
        "api/importer/group_mappings/",
        importer_views.group_mappings,
        name="group_mappings",
    ),
    path(
        "api/importer/get_folder_contents/",
        importer_views.get_folder_contents,
        name="get_folder_contents",
    ),
    # TUS Upload URLs (custom implementation)
    path("upload/", TusUploadView.as_view(), name="tus_upload"),
    path("upload/<uuid:resource_id>", TusUploadView.as_view(), name="tus_upload_chunks"),
    # Admin URLs
    path(
        "api/biomero/admin/config/",
        admin_views.admin_config,
        name="admin_config",
    ),
    # Analyzer API under /api/analyzer/
    path(
        "api/analyzer/workflows/",
        analyzer_views.list_workflows,  # GET
        name="analyzer_workflows_list",
    ),
    path(
        "api/analyzer/workflows/<str:name>/",
        analyzer_views.get_workflow_metadata,  # GET (include repo info in response)
        name="analyzer_workflow_detail",
    ),
    path(
        "api/analyzer/workflows/<str:name>/jobs/",
        analyzer_views.run_workflow_script,  # POST: create job for <name>
        name="analyzer_jobs_create",
    ),
    path(
        "api/analyzer/scripts/",
        analyzer_views.get_workflows,  # GET: legacy script info for menu
        name="analyzer_scripts_list",
    ),
    path(
        "api/analyzer/slurm/status/",
        analyzer_views.get_slurm_status,  # GET: SLURM cluster status
        name="analyzer_slurm_status",
    ),
    # Prediction URLs
    path(
        "api/prediction/models/",
        prediction_views.list_models,
        name="prediction_list_models",
    ),
    path(
        "api/prediction/channels/",
        prediction_views.get_image_channels,
        name="prediction_image_channels",
    ),
    path(
        "api/prediction/channel_plane/",
        prediction_views.get_channel_plane_data,
        name="prediction_channel_plane",
    ),
    path(
        "api/prediction/save_annotations/",
        prediction_views.save_annotations,
        name="prediction_save_annotations",
    ),
    path(
        "api/prediction/annotation_sets/",
        prediction_views.list_annotation_sets,
        name="prediction_list_annotation_sets",
    ),
    path(
        "api/prediction/train/",
        prediction_views.run_training,
        name="prediction_run_training",
    ),
    path(
        "api/prediction/fetch_annotations/",
        prediction_views.fetch_annotations,
        name="prediction_fetch_annotations",
    ),
    path(
        "api/prediction/predict/",
        prediction_views.run_prediction,
        name="prediction_predict",
    ),
    # Main Biomero URL
    path(
        "biomero/",
        biomero_views.biomero,
        name="biomero",
    ),
]
