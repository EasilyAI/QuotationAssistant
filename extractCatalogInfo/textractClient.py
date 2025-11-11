import boto3
import json
import os
import csv
from collections import defaultdict
from typing import List, Dict, Any, Tuple

def start_job(bucket, document, features=['TABLES','FORMS'], region='us-east-1'):
    client = boto3.client('textract', region_name=region)
    response = client.start_document_analysis(
        DocumentLocation={'S3Object': {'Bucket': bucket, 'Name': document}},
        FeatureTypes=features
    )
    job_id = response['JobId']
    print(f"Started job with JobId: {job_id}")
    return job_id

def is_job_complete(job_id, region='us-east-1'):
    client = boto3.client('textract', region_name=region)
    response = client.get_document_analysis(JobId=job_id)
    status = response['JobStatus']
    print(f"Job status: {status}")
    return status

def get_job_results(job_id, region='us-east-1'):
    client = boto3.client('textract', region_name=region)
    pages = []
    next_token = None

    while True:
        if next_token:
            response = client.get_document_analysis(JobId=job_id, NextToken=next_token)
        else:
            response = client.get_document_analysis(JobId=job_id)
        pages.append(response)
        print(f"Retrieved {len(response.get('Blocks', []))} blocks on this page.")
        next_token = response.get('NextToken')
        if not next_token:
            break
        print("Fetching next page of results...")
    return pages

def save_results_to_file(pages, out_filename='textract_output.json'):
    # if you want to save full list of pages into one file:
    with open(out_filename, 'w', encoding='utf-8') as f:
        json.dump(pages, f, indent=2)
    print(f"Saved results to {out_filename}")








def load_textract_pages(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # Some folks save a single dict; others save a list of pages. Normalize:
    if isinstance(data, dict) and "Blocks" in data:
        return [data]
    elif isinstance(data, list):
        return data
    else:
        raise ValueError("Unexpected JSON structure – expected a list of responses or a single response with Blocks.")

def build_block_maps(blocks: List[Dict[str, Any]]):
    """Return dicts for quick lookup by Id and by BlockType."""
    id_map = {}
    type_map = defaultdict(list)
    for b in blocks:
        bid = b.get("Id")
        if bid:
            id_map[bid] = b
        type_map[b.get("BlockType","")].append(b)
    return id_map, type_map

def get_text_for_block(block: Dict[str,Any], id_map: Dict[str,Any]) -> str:
    """Collect WORD/SELECTION_ELEMENT text under a LINE or CELL, etc."""
    text = []
    for rel in block.get("Relationships", []):
        if rel.get("Type") == "CHILD":
            for cid in rel.get("Ids", []):
                child = id_map.get(cid)
                if not child: 
                    continue
                if child.get("BlockType") == "WORD":
                    text.append(child.get("Text",""))
                elif child.get("BlockType") == "SELECTION_ELEMENT":
                    if child.get("SelectionStatus") == "SELECTED":
                        text.append("[X]")
    return " ".join(text).strip()

import re
from collections import defaultdict

def _collect_cells_for_table(tblock, id_map):
    """Return list of CELLs, and MERGED_CELLs (if any) for this table."""
    cells, merged = [], []
    for rel in tblock.get("Relationships", []):
        if rel.get("Type") != "CHILD":
            continue
        for cid in rel.get("Ids", []):
            b = id_map.get(cid)
            if not b: 
                continue
            bt = b.get("BlockType")
            if bt == "CELL":
                cells.append(b)
            elif bt == "MERGED_CELL":
                merged.append(b)
    return cells, merged

def extract_tables_from_blocks_unmerged(blocks, replicate_data=True, header_scan_rows=5):
    """
    Build span-aware grids and unmerge merged cells.
    - replicate_data=True: copy merged cell values across spanned columns in data rows.
    - header_scan_rows: how many top rows to consider when building composite headers.
    Returns: [{page, table_index, headers, rows, spans}]
    """
    # Build maps
    id_map, type_map = build_block_maps(blocks)

    out = []
    for t_index, tblock in enumerate(type_map.get("TABLE", []), start=1):
        page = tblock.get("Page", None)

        cells, merged_cells = _collect_cells_for_table(tblock, id_map)

        # Compute table size considering spans
        max_row = max((c.get("RowIndex", 0) + c.get("RowSpan", 1) - 1) for c in cells) if cells else 0
        max_col = max((c.get("ColumnIndex", 0) + c.get("ColumnSpan", 1) - 1) for c in cells) if cells else 0

        # Init grid + span holders
        grid = [["" for _ in range(max_col)] for _ in range(max_row)]
        spans = [[(1,1) for _ in range(max_col)] for _ in range(max_row)]
        is_header_row = [False]*max_row  # we'll guess header band later

        # Helper: place text across span
        def place_text(r0, c0, rs, cs, txt, is_header=False, replicate=True):
            # top-left always gets text and span
            grid[r0][c0] = txt if not grid[r0][c0] else grid[r0][c0]
            spans[r0][c0] = (rs, cs)
            # optional replication across covered cells
            if replicate:
                for rr in range(r0, r0+rs):
                    for cc in range(c0, c0+cs):
                        if rr == r0 and cc == c0:
                            continue
                        if is_header:
                            # In header rows, copy parent so we can compose later
                            if not grid[rr][cc]:
                                grid[rr][cc] = txt
                        else:
                            if not grid[rr][cc]:
                                grid[rr][cc] = txt

        # First pass: put CELL text and spans
        for c in cells:
            r0 = c.get("RowIndex", 1)-1
            c0 = c.get("ColumnIndex", 1)-1
            rs = c.get("RowSpan", 1)
            cs = c.get("ColumnSpan", 1)
            txt = get_text_for_block(c, id_map)
            place_text(r0, c0, rs, cs, txt, is_header=False, replicate=replicate_data)

        # If MERGED_CELL is present, ensure its text is propagated as well
        for m in merged_cells:
            # Textract links MERGED_CELL -> CHILD -> CELL ids
            child_ids = []
            for rel in m.get("Relationships", []):
                if rel.get("Type") == "CHILD":
                    child_ids.extend(rel.get("Ids", []))
            child_cells = [id_map[i] for i in child_ids if id_map.get(i) and id_map[i].get("BlockType")=="CELL"]
            if not child_cells:
                continue
            # Compute merged area (min row/col, max row/col)
            r_indices = []
            c_indices = []
            for cc in child_cells:
                ri = cc.get("RowIndex", 1)-1
                ci = cc.get("ColumnIndex", 1)-1
                rs = cc.get("RowSpan", 1)
                cs = cc.get("ColumnSpan", 1)
                r_indices.extend(list(range(ri, ri+rs)))
                c_indices.extend(list(range(ci, ci+cs)))
            r0, c0 = min(r_indices), min(c_indices)
            rs = max(r_indices) - r0 + 1
            cs = max(c_indices) - c0 + 1
            txt = get_text_for_block(m, id_map) or get_text_for_block(child_cells[0], id_map)
            place_text(r0, c0, rs, cs, txt, is_header=False, replicate=replicate_data)

        # ---- Header detection & composition (multi-row headers) ----
        # Density-based header band guess
        densities = [sum(1 for x in row if x.strip()) for row in grid[:min(header_scan_rows, max_row)]]
        header_end = 0
        for i in range(len(densities)):
            header_end = i
            if i > 0 and densities[i] <= max(1, densities[i-1]//2):
                break
        header_rows = list(range(0, header_end+1))
        for r in header_rows:
            is_header_row[r] = True

        # Compose headers: parent spans replicated above child columns become "Parent / Child"
        headers = []
        for c in range(max_col):
            parts = []
            for r in header_rows:
                t = grid[r][c].strip()
                if t and (not parts or t.lower() != parts[-1].lower()):
                    parts.append(t)
            header = " / ".join(parts) if parts else f"col_{c+1}"
            headers.append(header)

        # Body rows
        body_rows = [grid[r] for r in range(max_row) if not is_header_row[r]]

        out.append({
            "page": page,
            "table_index": t_index,
            "headers": headers,
            "rows": body_rows,
            "spans": spans,  # keep for downstream logic if needed
        })
    return out

def extract_forms_kv(blocks: List[Dict[str,Any]]) -> List[Dict[str,str]]:
    """Extract KEY_VALUE_SET (FORMS) pairs."""
    id_map, type_map = build_block_maps(blocks)
    kv_pairs = []

    for kv in type_map.get("KEY_VALUE_SET", []):
        if "KEY" not in kv.get("EntityTypes", []):
            continue
        key_text = get_text_for_block(kv, id_map)
        value_text = ""
        # find linked VALUE via Relationships of type VALUE
        for rel in kv.get("Relationships", []):
            if rel.get("Type") == "VALUE":
                for vid in rel.get("Ids", []):
                    vblock = id_map.get(vid)
                    if vblock and vblock.get("BlockType") == "KEY_VALUE_SET":
                        value_text = get_text_for_block(vblock, id_map)
        if key_text or value_text:
            kv_pairs.append({
                "page": kv.get("Page"),
                "key": key_text,
                "value": value_text
            })
    return kv_pairs

def write_tables_csv(tables: List[Dict[str,Any]], output_dir="output"):
    tables_dir = os.path.join(output_dir, "tables_out")
    os.makedirs(tables_dir, exist_ok=True)
    
    # per-table CSVs
    for t in tables:
        page = t["page"]
        idx = t["table_index"]
        headers = t["headers"]
        rows = t["rows"]
        path = os.path.join(tables_dir, f"tables_page_{page}_table_{idx}.csv")
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(headers)
            w.writerows(rows)

    # consolidated CSV (best-effort union of headers)
    # We'll normalize headers per table and write them one under another, with blank filler for missing cols.
    all_headers = set()
    norm_tables = []
    for t in tables:
        headers = [h.strip() for h in t["headers"]]
        all_headers.update(headers)
        norm_tables.append((headers, t["rows"], t["page"], t["table_index"]))
    all_headers = list(all_headers)

    with open(os.path.join(tables_dir, "tables_consolidated.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["page","table_index"] + all_headers)
        for headers, rows, page, tindex in norm_tables:
            for r in rows:
                rowmap = dict(zip(headers, r))
                w.writerow([page, tindex] + [rowmap.get(h, "") for h in all_headers])

def write_forms_csv(forms: List[Dict[str,str]], output_dir="output"):
    if not forms:
        return
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, "forms_kv_pairs.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["page","key","value"])
        for kv in forms:
            w.writerow([kv["page"], kv["key"], kv["value"]])

def build_llm_jsonl(tables: List[Dict[str,Any]], output_dir="output", max_rows_per_chunk=50):
    """
    Emit compact, LLM-friendly JSONL. Each line contains:
      { "page": n, "table_index": i, "headers": [...], "rows": [[...],...]}
    Split large tables into chunks to keep tokens manageable.
    """
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, "tables_for_llm.jsonl")
    with open(path, "w", encoding="utf-8") as f:
        for t in tables:
            headers = t["headers"]
            rows = t["rows"]
            page = t["page"]
            ti = t["table_index"]

            # chunk
            for start in range(0, len(rows), max_rows_per_chunk):
                chunk = rows[start:start+max_rows_per_chunk]
                obj = {
                    "page": page,
                    "table_index": ti,
                    "row_range": [start, start+len(chunk)-1],
                    "headers": headers,
                    "rows": chunk
                }
                f.write(json.dumps(obj, ensure_ascii=False) + "\n")
