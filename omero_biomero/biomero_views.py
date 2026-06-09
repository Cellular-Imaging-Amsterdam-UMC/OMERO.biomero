import jwt
import logging
import os
import time
import requests
import urllib.parse
import psycopg2

from django.http import JsonResponse
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
    Render the main Biomero page with Metabase integration and user context.
    """

    metabase_site_url = os.environ.get("METABASE_SITE_URL")
    metabase_secret_key = os.environ.get("METABASE_SECRET_KEY")
    metabase_dashboard_id_monitor_workflows = os.environ.get(
        "METABASE_WORKFLOWS_DB_PAGE_DASHBOARD_ID"
    )
    metabase_dashboard_id_imports = os.environ.get(
        "METABASE_IMPORTS_DB_PAGE_DASHBOARD_ID"
    )

    importer_enabled = parse_bool_env(os.environ.get("IMPORTER_ENABLED"), default=True)
    analyzer_enabled = parse_bool_env(os.environ.get("ANALYZER_ENABLED"), default=True)

    current_user = conn.getUser()
    username = current_user.getName()
    user_id = current_user.getId()
    is_admin = conn.isAdmin()

    payload_monitor_workflows = {
        "resource": {"dashboard": int(metabase_dashboard_id_monitor_workflows)},
        "params": {"user": [user_id]},
        "exp": round(time.time()) + (60 * 30),
    }
    token_monitor_workflows = jwt.encode(
        payload_monitor_workflows, metabase_secret_key, algorithm="HS256"
    )

    payload_imports = {
        "resource": {"dashboard": int(metabase_dashboard_id_imports)},
        "params": {"user_name": [username]},
        "exp": round(time.time()) + (60 * 30),
    }
    token_imports = jwt.encode(payload_imports, metabase_secret_key, algorithm="HS256")

    context = {
        "metabase_site_url": metabase_site_url,
        "metabase_token_monitor_workflows": token_monitor_workflows,
        "metabase_token_imports": token_imports,
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
    Query Metabase API using the signed token and return the raw JSON results.
    Filters/searches and pages results, then enriches only the sliced rows.
    """
    dashboard_type = request.GET.get("dashboard_type")
    if dashboard_type not in ["imports", "workflows"]:
        return JsonResponse({"error": "Invalid dashboard_type"}, status=400)

    try:
        page = int(request.GET.get("page", 1))
        limit = int(request.GET.get("limit", 50))
    except (ValueError, TypeError):
        page = 1
        limit = 50
    search_term = request.GET.get("search", "").strip().lower()

    # Load environment variables
    metabase_site_url = os.environ.get("METABASE_SITE_URL")
    metabase_secret_key = os.environ.get("METABASE_SECRET_KEY")
    metabase_dashboard_id_monitor_workflows = os.environ.get(
        "METABASE_WORKFLOWS_DB_PAGE_DASHBOARD_ID"
    )
    metabase_dashboard_id_imports = os.environ.get(
        "METABASE_IMPORTS_DB_PAGE_DASHBOARD_ID"
    )

    current_user = conn.getUser()
    username = current_user.getName()
    user_id = current_user.getId()

    # Construct payload and target dashboard ID
    if dashboard_type == "imports":
        dashboard_id = int(metabase_dashboard_id_imports)
        payload = {
            "resource": {"dashboard": dashboard_id},
            "params": {"user_name": [username]},
            "exp": round(time.time()) + (60 * 30),
        }
        card_name = "Upload Status"
    else:
        dashboard_id = int(metabase_dashboard_id_monitor_workflows)
        payload = {
            "resource": {"dashboard": dashboard_id},
            "params": {"user": [user_id]},
            "exp": round(time.time()) + (60 * 30),
        }
        card_name = "Biomero Workflow Progress"

    # Encode token
    token = jwt.encode(payload, metabase_secret_key, algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode("utf-8")

    # Handle internal networking inside docker containers
    # If METABASE_SITE_URL is localhost, use 'metabase' hostname internally
    parsed_url = urllib.parse.urlparse(metabase_site_url)
    if parsed_url.hostname in ["localhost", "127.0.0.1"]:
        internal_url = metabase_site_url.replace(parsed_url.hostname, "metabase")
    else:
        internal_url = metabase_site_url

    try:
        # 1. Fetch dashboard metadata to discover card IDs
        metadata_url = f"{internal_url}/api/embed/dashboard/{token}"
        metadata_resp = requests.get(metadata_url, timeout=10)
        if metadata_resp.status_code != 200:
            return JsonResponse(
                {"error": f"Failed to fetch Metabase dashboard metadata: {metadata_resp.text}"},
                status=metadata_resp.status_code
            )
        
        dashboard_metadata = metadata_resp.json()
        dashcards = dashboard_metadata.get("dashcards", [])
        
        target_dashcard = None
        for dc in dashcards:
            card = dc.get("card", {})
            if card.get("name") == card_name or (dashboard_type == "imports" and card.get("display") == "table"):
                target_dashcard = dc
                break
        
        if not target_dashcard:
            for dc in dashcards:
                if dc.get("card", {}).get("display") == "table":
                    target_dashcard = dc
                    break
                    
        if not target_dashcard:
            return JsonResponse({"error": f"Could not find table card on dashboard {dashboard_id}"}, status=404)
            
        dashcard_id = target_dashcard.get("id")
        card_id = target_dashcard.get("card", {}).get("id")
        
        # 2. Fetch the query results for the target card
        query_url = f"{internal_url}/api/embed/dashboard/{token}/dashcard/{dashcard_id}/card/{card_id}"
        query_resp = requests.get(query_url, timeout=10)
        if query_resp.status_code not in [200, 202]:
            return JsonResponse(
                {"error": f"Failed to fetch Metabase card query results: {query_resp.text}"},
                status=query_resp.status_code
            )
            
        result_data = query_resp.json()
        
        if "data" in result_data and "rows" in result_data["data"]:
            rows = result_data["data"]["rows"]
            cols = result_data["data"]["cols"]
            
            # 3. Apply search filtering
            if search_term:
                filtered_rows = []
                if dashboard_type == "imports":
                    file_names_idx = next((i for i, col in enumerate(cols) if col.get("name") == "file_names"), None)
                    stage_idx = next((i for i, col in enumerate(cols) if col.get("name") == "stage"), None)
                    user_name_idx = next((i for i, col in enumerate(cols) if col.get("name") == "user_name"), None)
                    uuid_idx = next((i for i, col in enumerate(cols) if col.get("name") == "uuid"), None)
                    
                    for row in rows:
                        match = False
                        if file_names_idx is not None and row[file_names_idx] and search_term in str(row[file_names_idx]).lower():
                            match = True
                        elif stage_idx is not None and row[stage_idx] and search_term in str(row[stage_idx]).lower():
                            match = True
                        elif user_name_idx is not None and row[user_name_idx] and search_term in str(row[user_name_idx]).lower():
                            match = True
                        elif uuid_idx is not None and row[uuid_idx] and search_term in str(row[uuid_idx]).lower():
                            match = True
                        if match:
                            filtered_rows.append(row)
                else: # workflows
                    name_idx = next((i for i, col in enumerate(cols) if col.get("name") == "name"), None)
                    main_task_idx = next((i for i, col in enumerate(cols) if col.get("name") == "main_task_name"), None)
                    status_idx = next((i for i, col in enumerate(cols) if col.get("name") == "status"), None)
                    wf_id_idx = next((i for i, col in enumerate(cols) if col.get("name") == "workflow_id"), None)
                    
                    for row in rows:
                        match = False
                        if name_idx is not None and row[name_idx] and search_term in str(row[name_idx]).lower():
                            match = True
                        elif main_task_idx is not None and row[main_task_idx] and search_term in str(row[main_task_idx]).lower():
                            match = True
                        elif status_idx is not None and row[status_idx] and search_term in str(row[status_idx]).lower():
                            match = True
                        elif wf_id_idx is not None and row[wf_id_idx] and search_term in str(row[wf_id_idx]).lower():
                            match = True
                        if match:
                            filtered_rows.append(row)
                rows = filtered_rows

            total_rows = len(rows)
            
            # 4. Slicing rows based on page & limit
            start_idx = (page - 1) * limit
            end_idx = page * limit
            sliced_rows = rows[start_idx:end_idx]
            
            # 5. Enrich only the sliced rows for imports dashboard
            if dashboard_type == "imports":
                uuid_idx = next((i for i, col in enumerate(cols) if col.get("name") == "uuid"), None)
                
                if uuid_idx is not None and len(sliced_rows) > 0:
                    uuids = [row[uuid_idx] for row in sliced_rows if row[uuid_idx]]
                    
                    if uuids:
                        db_url = os.environ.get("INGEST_TRACKING_DB_URL")
                        if db_url:
                            if db_url.startswith("postgresql+psycopg2://"):
                                db_url = db_url.replace("postgresql+psycopg2://", "postgresql://")
                            
                            try:
                                with psycopg2.connect(db_url) as db_conn:
                                    with db_conn.cursor() as cursor:
                                        if len(uuids) == 1:
                                            cursor.execute("SELECT uuid, destination_type FROM imports WHERE uuid = %s", (uuids[0],))
                                        else:
                                            cursor.execute("SELECT uuid, destination_type FROM imports WHERE uuid IN %s", (tuple(uuids),))
                                        db_results = {uuid_val: dest_type for uuid_val, dest_type in cursor.fetchall()}
                                        
                                        result_data["data"]["cols"].append({
                                            "display_name": "destination_type",
                                            "name": "destination_type",
                                            "base_type": "type/Text",
                                            "effective_type": "type/Text"
                                        })
                                        
                                        for row in sliced_rows:
                                            row_uuid = row[uuid_idx]
                                            row.append(db_results.get(row_uuid, "Dataset"))
                            except Exception as db_err:
                                logger.error(f"Error enriching Metabase results from DB: {db_err}")
            
            # Write back paginated data and stats
            result_data["data"]["rows"] = sliced_rows
            result_data["data"]["total_rows"] = total_rows
            result_data["data"]["page"] = page
            result_data["data"]["limit"] = limit
                            
        return JsonResponse(result_data)
        
    except Exception as err:
        logger.error(f"Error proxying Metabase query: {err}", exc_info=True)
        return JsonResponse({"error": str(err)}, status=500)
