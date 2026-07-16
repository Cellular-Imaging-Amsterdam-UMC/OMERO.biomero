import jwt
import json
import logging
import os
import time
import requests
import urllib.parse
import psycopg2
from datetime import datetime

from django.http import JsonResponse
from omero.rtypes import rlist, rstring, unwrap
from omero.sys import ParametersI
from omeroweb.webclient.decorators import login_required, render_response

from .utils import (
    get_react_build_file,
    parse_bool_env,
)
from .settings import (
    BASE_DIR,
    UPLOADER_ALLOWED_FILE_EXTENSIONS,
)

logger = logging.getLogger(__name__)


def _normalized_file_name(value):
    normalized = str(value or "").replace(chr(92), "/").rstrip("/")
    return normalized.rsplit("/", 1)[-1].casefold()


def _resolve_import_file_targets(conn, rows):
    """Resolve visible filenames to accessible OMERO Images or Plates."""
    uuids = list(dict.fromkeys(str(row[3]) for row in rows if row[3]))
    if not uuids:
        return [{} for _ in rows]

    resolved = {}
    query_service = conn.getQueryService()
    for object_type in ("Image", "Plate"):
        query = f"""
            SELECT DISTINCT uuid_value.value, obj.id, obj.name,
                            path_value.value
            FROM {object_type}AnnotationLink link
            JOIN link.child annotation
            JOIN annotation.mapValue uuid_value
            JOIN annotation.mapValue path_value
            JOIN link.parent obj
            WHERE uuid_value.name = :uuid_key
              AND uuid_value.value IN (:uuids)
              AND path_value.name = :filepath_key
        """
        params = ParametersI()
        params.addString("uuid_key", "UUID")
        params.addString("filepath_key", "Filepath")
        params.map["uuids"] = rlist([rstring(value) for value in uuids])

        try:
            projection = query_service.projection(
                query, params, conn.SERVICE_OPTS
            )
        except Exception:
            logger.warning(
                "Could not resolve import links for OMERO %ss",
                object_type.lower(),
                exc_info=True,
            )
            continue

        for (
            uuid_value,
            object_id,
            object_name,
            file_path,
        ) in unwrap(projection):
            uuid_value = str(uuid_value)
            target = f"{object_type.lower()}-{object_id}"
            names = {
                _normalized_file_name(object_name),
                _normalized_file_name(file_path),
            }
            for name in names - {""}:
                names_by_uuid = resolved.setdefault(uuid_value, {})
                names_by_uuid.setdefault(name, set()).add(target)

    row_targets = []
    for row in rows:
        uuid_value = str(row[3] or "")
        candidates = resolved.get(uuid_value, {})
        try:
            file_names = json.loads(row[0] or "[]")
        except (TypeError, ValueError):
            file_names = []

        targets = {}
        if isinstance(file_names, list):
            for file_name in file_names:
                normalized_name = _normalized_file_name(file_name)
                matches = candidates.get(normalized_name, set())
                if matches:
                    targets[str(file_name)] = sorted(matches)
        row_targets.append(targets)

    return row_targets


def _parse_date_filter(request):
    date_from_raw = request.GET.get("date_from")
    date_to_raw = request.GET.get("date_to")
    date_mode = request.GET.get("date_mode", "include")

    if not date_from_raw and not date_to_raw:
        return None, None
    if not date_from_raw or not date_to_raw:
        return None, "date_from and date_to must be provided together"
    if date_mode not in {"include", "exclude"}:
        return None, "Invalid date_mode"
    if len(date_from_raw) > 64 or len(date_to_raw) > 64:
        return None, "Invalid date range"

    try:
        date_from = datetime.fromisoformat(date_from_raw.replace("Z", "+00:00"))
        date_to = datetime.fromisoformat(date_to_raw.replace("Z", "+00:00"))
    except ValueError:
        return None, "Invalid date range"

    if date_from.utcoffset() is None or date_to.utcoffset() is None:
        return None, "Date range must include a timezone"
    if date_from >= date_to:
        return None, "date_from must be before date_to"

    return {
        "date_from": date_from,
        "date_to": date_to,
        "date_mode": date_mode,
    }, None


# TODO remove this check when the app is ready
def check_base_directory():
    logger.info("\n=== Directory Access Check ===")
    logger.info(f"Checking directory structure and permissions:")
    logger.info(f"L-Drive directory: {BASE_DIR}")
    logger.info(f"   - Exists: {os.path.exists(BASE_DIR)}")
    logger.info(
        f"   - Readable: {os.access(BASE_DIR, os.R_OK) if os.path.exists(BASE_DIR) else 'N/A'}"
    )
    logger.info(
        f"   - Executable: {os.access(BASE_DIR, os.X_OK) if os.path.exists(BASE_DIR) else 'N/A'}"
    )


check_base_directory()


@login_required()
@render_response()
def biomero(request, conn=None, **kwargs):
    """
    Render the main Biomero page with user context.
    """
    importer_enabled = parse_bool_env(os.environ.get("IMPORTER_ENABLED"), default=True)
    analyzer_enabled = parse_bool_env(os.environ.get("ANALYZER_ENABLED"), default=True)

    current_user = conn.getUser()
    username = current_user.getName()
    user_id = current_user.getId()
    is_admin = conn.isAdmin()

    context = {
        "metabase_site_url": "",
        "metabase_token_monitor_workflows": "",
        "metabase_token_imports": "",
        "template": "omero_biomero/webclient_plugins/react_app.html",
        "user_name": username,
        "user_id": user_id,
        "is_admin": is_admin,
        "main_js": get_react_build_file("main.js"),
        "main_css": get_react_build_file("main.css"),
        "title": "BIOMERO",
        "app_name": "biomero",
        "importer_enabled": importer_enabled,
        "analyzer_enabled": analyzer_enabled,
        "uploader_allowed_file_extensions": UPLOADER_ALLOWED_FILE_EXTENSIONS,
    }
    return context


@login_required()
def metabase_data(request, conn=None, **kwargs):
    """
    Query database-biomero directly and return the results in the exact same format
    as Metabase API results.
    """
    dashboard_type = request.GET.get("dashboard_type")
    if dashboard_type not in ["imports", "workflows"]:
        return JsonResponse({"error": "Invalid dashboard_type"}, status=400)

    date_filter, date_filter_error = _parse_date_filter(request)
    if date_filter_error:
        return JsonResponse({"error": date_filter_error}, status=400)

    try:
        page = int(request.GET.get("page", 1))
        limit = int(request.GET.get("limit", 50))
    except (ValueError, TypeError):
        page = 1
        limit = 50
    page = max(1, page)
    limit = max(1, min(limit, 100))
    search_term = request.GET.get("search", "").strip().lower()

    db_url = os.environ.get("INGEST_TRACKING_DB_URL")
    if not db_url:
        logger.error("INGEST_TRACKING_DB_URL environment variable not set")
        return JsonResponse({"error": "INGEST_TRACKING_DB_URL not set"}, status=500)

    if db_url.startswith("postgresql+psycopg2://"):
        db_url = db_url.replace("postgresql+psycopg2://", "postgresql://")

    current_user = conn.getUser()
    username = current_user.getName()
    user_id = current_user.getId()

    try:
        with psycopg2.connect(db_url) as db_conn:
            with db_conn.cursor() as cursor:
                if dashboard_type == "imports":
                    date_clause = ""
                    date_params = []
                    if date_filter:
                        if date_filter["date_mode"] == "exclude":
                            date_clause = (
                                "AND NOT (ft.last_timestamp >= %s "
                                "AND ft.last_timestamp < %s)"
                            )
                        else:
                            date_clause = (
                                "AND ft.last_timestamp >= %s "
                                "AND ft.last_timestamp < %s"
                            )
                        date_params = [
                            date_filter["date_from"],
                            date_filter["date_to"],
                        ]

                    # Fetch imports data directly using CTEs to format elapsed times
                    query = f"""
                    WITH ElapsedTimes AS (
                        SELECT 
                            uuid,
                            MAX(timestamp) AS last_timestamp,
                            MIN(timestamp) AS first_timestamp,
                            (MAX(timestamp) - MIN(timestamp)) AS elapsed_time
                        FROM imports
                        GROUP BY uuid
                    ),
                    FormattedTimes AS (
                        SELECT 
                            uuid,
                            last_timestamp,
                            first_timestamp,
                            elapsed_time,
                            EXTRACT(YEAR FROM elapsed_time) AS years,
                            EXTRACT(MONTH FROM elapsed_time) AS months,
                            EXTRACT(DAY FROM elapsed_time) AS days,
                            EXTRACT(HOUR FROM elapsed_time) AS hours,
                            EXTRACT(MINUTE FROM elapsed_time) AS minutes,
                            FLOOR(EXTRACT(SECOND FROM elapsed_time)) AS seconds
                        FROM ElapsedTimes
                    ),
                    LatestStage AS (
                        SELECT 
                            uuid,
                            stage,
                            ROW_NUMBER() OVER (PARTITION BY uuid ORDER BY timestamp DESC) AS rn
                        FROM imports
                    )
                    SELECT DISTINCT
                        imports.file_names,
                        ls.stage,
                        imports.destination_id as "Dataset/Screen",
                        ft.uuid,
                        ft.last_timestamp AS timestamp,
                        TRIM(BOTH ',' FROM 
                            CONCAT_WS(', ', 
                                CASE WHEN ft.years > 0 THEN CONCAT(ft.years, ' year', CASE WHEN ft.years > 1 THEN 's' END) END,
                                CASE WHEN ft.months > 0 THEN CONCAT(ft.months, ' month', CASE WHEN ft.months > 1 THEN 's' END) END,
                                CASE WHEN ft.days > 0 THEN CONCAT(ft.days, ' day', CASE WHEN ft.days > 1 THEN 's' END) END,
                                CASE WHEN ft.hours > 0 THEN CONCAT(ft.hours, ' hour', CASE WHEN ft.hours > 1 THEN 's' END) END,
                                CASE WHEN ft.minutes > 0 THEN CONCAT(ft.minutes, ' minute', CASE WHEN ft.minutes > 1 THEN 's' END) END,
                                CASE WHEN ft.seconds > 0 THEN CONCAT(ft.seconds, ' second', CASE WHEN ft.seconds > 1 THEN 's' END) END
                            )
                        ) AS elapsed_time, 
                        imports.group_name,
                        imports.user_name,
                        imports.description,
                        imports.destination_type
                    FROM FormattedTimes ft
                    JOIN LatestStage ls ON ft.uuid = ls.uuid
                    JOIN imports ON imports.uuid = ft.uuid
                    WHERE ls.rn = 1 and imports.stage = ls.stage
                      AND imports.user_name = %s
                      {date_clause}
                    ORDER BY ft.last_timestamp DESC;
                    """
                    cursor.execute(query, tuple([username, *date_params]))
                    raw_rows = cursor.fetchall()

                    # Filter rows in Python to match search_term logic
                    rows = []
                    for row in raw_rows:
                        if search_term:
                            file_names = str(row[0] or "").lower()
                            stage = str(row[1] or "").lower()
                            uuid = str(row[3] or "").lower()
                            user_name = str(row[7] or "").lower()
                            if (search_term not in file_names and
                                search_term not in stage and
                                search_term not in uuid and
                                search_term not in user_name):
                                continue
                        
                        row_list = list(row)
                        # format datetime as string
                        if row_list[4] and hasattr(row_list[4], "isoformat"):
                            row_list[4] = row_list[4].isoformat()
                        rows.append(row_list)

                    cols = [
                        {"name": "file_names", "display_name": "File Names"},
                        {"name": "stage", "display_name": "Stage"},
                        {"name": "Dataset/Screen", "display_name": "Dataset/Screen"},
                        {"name": "uuid", "display_name": "Uuid"},
                        {"name": "timestamp", "display_name": "Timestamp"},
                        {"name": "elapsed_time", "display_name": "Elapsed Time"},
                        {"name": "group_name", "display_name": "Group Name"},
                        {"name": "user_name", "display_name": "User Name"},
                        {"name": "description", "display_name": "Description"},
                        {"name": "destination_type", "display_name": "destination_type"}
                    ]

                else: # workflows
                    date_clause = ""
                    date_params = []
                    if date_filter:
                        if date_filter["date_mode"] == "exclude":
                            date_clause = (
                                "AND NOT (start_time >= %s AND start_time < %s)"
                            )
                        else:
                            date_clause = (
                                "AND start_time >= %s AND start_time < %s"
                            )
                        date_params = [
                            date_filter["date_from"],
                            date_filter["date_to"],
                        ]

                    # Fetch from biomero_workflow_progress_view
                    query = f"""
                    SELECT workflow_id, name, main_task_name, status, progress, start_time, task, "group", "user"
                    FROM biomero_workflow_progress_view
                    WHERE "user" = %s
                      {date_clause}
                    ORDER BY start_time DESC;
                    """
                    cursor.execute(query, tuple([user_id, *date_params]))
                    raw_rows = cursor.fetchall()

                    # Filter rows in Python to match search_term logic
                    rows = []
                    for row in raw_rows:
                        if search_term:
                            wf_id = str(row[0] or "").lower()
                            name = str(row[1] or "").lower()
                            main_task_name = str(row[2] or "").lower()
                            status = str(row[3] or "").lower()
                            task = str(row[6] or "").lower()
                            if (search_term not in wf_id and
                                search_term not in name and
                                search_term not in main_task_name and
                                search_term not in status and
                                search_term not in task):
                                continue

                        row_list = list(row)
                        # convert UUID to string
                        if row_list[0]:
                            row_list[0] = str(row_list[0])
                        # format datetime as string
                        if row_list[5] and hasattr(row_list[5], "isoformat"):
                            row_list[5] = row_list[5].isoformat()
                        rows.append(row_list)

                    cols = [
                        {"name": "workflow_id", "display_name": "Workflow ID"},
                        {"name": "name", "display_name": "Name"},
                        {"name": "main_task_name", "display_name": "Main Task Name"},
                        {"name": "status", "display_name": "Status"},
                        {"name": "progress", "display_name": "Progress"},
                        {"name": "start_time", "display_name": "Start Time"},
                        {"name": "task", "display_name": "Task"},
                        {"name": "group", "display_name": "Group"},
                        {"name": "user", "display_name": "User"}
                    ]

        total_rows = len(rows)
        start_idx = (page - 1) * limit
        end_idx = page * limit
        sliced_rows = rows[start_idx:end_idx]

        if dashboard_type == "imports":
            file_targets = _resolve_import_file_targets(conn, sliced_rows)
            sliced_rows = [
                [*row, targets]
                for row, targets in zip(sliced_rows, file_targets)
            ]
            cols.append({
                "name": "file_targets",
                "display_name": "File Targets",
            })

        result_data = {
            "data": {
                "cols": cols,
                "rows": sliced_rows,
                "total_rows": total_rows,
                "page": page,
                "limit": limit
            }
        }
        return JsonResponse(result_data)

    except Exception as err:
        logger.error(f"Error querying tracking database: {err}", exc_info=True)
        return JsonResponse({"error": str(err)}, status=500)
