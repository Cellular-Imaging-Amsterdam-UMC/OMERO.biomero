from django.urls import path
from .tus_views import TusUploadView
from . import (
    admin_views,
    analyzer_views,
    annotate_ai_views,
    biomero_views,
    importer_views,
    prediction_views,
    sam_views,
    training_views,
)

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
    # Prediction URLs (renamed from stardist)
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
    # SAM URLs
    path(
        "api/sam/set_image/",
        sam_views.set_image,
        name="sam_set_image",
    ),
    path(
        "api/sam/predict/",
        sam_views.predict,
        name="sam_predict",
    ),
    # Annotate AI URLs — Manifest CRUD
    path(
        "api/annotate/save_manifest/",
        annotate_ai_views.save_manifest,
        name="save_manifest",
    ),
    path(
        "api/annotate/load_manifest/",
        annotate_ai_views.load_manifest,
        name="load_manifest",
    ),
    path(
        "api/annotate/list_manifests/",
        annotate_ai_views.list_manifests,
        name="list_manifests",
    ),
    path(
        "api/annotate/delete_manifest/",
        annotate_ai_views.delete_manifest,
        name="delete_manifest",
    ),
    # Annotate AI URLs — Container browsing
    path(
        "api/annotate/containers/",
        annotate_ai_views.list_containers,
        name="annotate_list_containers",
    ),
    path(
        "api/annotate/container_images/",
        annotate_ai_views.get_container_images,
        name="annotate_container_images",
    ),
    path(
        "api/annotate/image_channels/",
        annotate_ai_views.get_image_channels,
        name="annotate_image_channels",
    ),
    path(
        "api/annotate/config/",
        annotate_ai_views.manage_config,
        name="annotate_config",
    ),
    path(
        "api/annotate/tracking_table/",
        annotate_ai_views.manage_tracking_table,
        name="annotate_tracking_table",
    ),
    path(
        "api/annotate/tracking_table/<int:table_id>/",
        annotate_ai_views.get_tracking_table_detail,
        name="annotate_tracking_table_detail",
    ),
    path(
        "api/annotate/save_annotation/",
        annotate_ai_views.save_annotation,
        name="annotate_save_annotation",
    ),
    path(
        "api/annotate/fetch_annotation/",
        annotate_ai_views.fetch_annotation,
        name="annotate_fetch_annotation",
    ),
    path(
        "api/annotate/progress/",
        annotate_ai_views.get_progress,
        name="annotate_progress",
    ),
    path(
        "api/annotate/validate_training/",
        annotate_ai_views.validate_training_readiness,
        name="annotate_validate_training",
    ),
    path(
        "api/annotate/mark_processed/",
        annotate_ai_views.mark_unit_processed,
        name="annotate_mark_processed",
    ),
    path(
        "api/annotate/add_patch/",
        annotate_ai_views.add_patch,
        name="annotate_add_patch",
    ),
    # Training URLs
    path(
        "api/analyzer/training/start/",
        training_views.start_training,
        name="training_start",
    ),
    path(
        "api/analyzer/training/models/",
        training_views.list_trained_models,
        name="training_list_models",
    ),
    # Main Biomero URL
    path(
        "biomero/",
        biomero_views.biomero,
        name="biomero",
    ),
]
