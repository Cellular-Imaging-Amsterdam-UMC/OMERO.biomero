from django.urls import path

from . import (
    admin_views,
    analyzer_views,
    annotate_ai_views,
    biomero_views,
    importer_views,
    stardist_views,
)

urlpatterns = [
    # Importer URLs
    path(
        "api/importer/import_selected/",
        importer_views.import_selected,
        name="import_selected",
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
    # Stardist URLs
    path(
        "api/stardist/models/",
        stardist_views.list_models,
        name="stardist_list_models",
    ),
    path(
        "api/stardist/channels/",
        stardist_views.get_image_channels,
        name="stardist_image_channels",
    ),
    path(
        "api/stardist/save_annotations/",
        stardist_views.save_annotations,
        name="stardist_save_annotations",
    ),
    path(
        "api/stardist/train/",
        stardist_views.run_training,
        name="stardist_run_training",
    ),
    path(
        "api/stardist/fetch_annotations/",
        stardist_views.fetch_annotations,
        name="stardist_fetch_annotations",
    ),
    path(
        "api/stardist/predict/",
        stardist_views.run_prediction,
        name="stardist_predict",
    ),
    # Annotate AI URLs
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
    # Main Biomero URL
    path(
        "biomero/",
        biomero_views.biomero,
        name="biomero",
    ),
]
