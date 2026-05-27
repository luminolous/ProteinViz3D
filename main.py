from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import httpx
import re

app = FastAPI(title="ProteinViz3D")

RCSB_PDB_URL  = "https://files.rcsb.org/download/{pdb_id}.pdb"
RCSB_META_URL = "https://data.rcsb.org/rest/v1/core/entry/{pdb_id}"
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


def validate_pdb_id(pdb_id: str) -> str:
    pdb_id = pdb_id.upper().strip()
    if not re.match(r"^[A-Z0-9]{4}$", pdb_id):
        raise HTTPException(
            status_code=400,
            detail="PDB ID harus tepat 4 karakter alfanumerik (contoh: 1HHO, 6LU7)"
        )
    return pdb_id


@app.get("/api/pdb/{pdb_id}")
async def fetch_pdb(pdb_id: str):
    pdb_id = validate_pdb_id(pdb_id)

    async with httpx.AsyncClient(timeout=20.0) as client:
        pdb_resp = await client.get(RCSB_PDB_URL.format(pdb_id=pdb_id))
        if pdb_resp.status_code != 200:
            raise HTTPException(
                status_code=404,
                detail=f"PDB ID '{pdb_id}' tidak ditemukan di RCSB PDB"
            )

        meta = {
            "id": pdb_id,
            "title": "—",
            "method": "—",
            "resolution": None,
            "chains": "—",
            "atoms": "—",
            "date": "—",
        }

        try:
            meta_resp = await client.get(RCSB_META_URL.format(pdb_id=pdb_id))
            if meta_resp.status_code == 200:
                d    = meta_resp.json()
                info = d.get("rcsb_entry_info", {})
                res  = info.get("resolution_combined", [None])
                meta.update({
                    "title"     : d.get("struct", {}).get("title", "—"),
                    "method"    : info.get("experimental_method", "—"),
                    "resolution": round(res[0], 2) if res and res[0] else None,
                    "chains"    : info.get("polymer_entity_count_protein", "—"),
                    "atoms"     : info.get("deposited_atom_count", "—"),
                    "date"      : d.get("rcsb_accession_info", {}).get("deposit_date", "—"),
                })
        except Exception:
            pass  # metadata bersifat opsional

        return JSONResponse({"pdb_data": pdb_resp.text, "meta": meta})


@app.post("/api/upload")
async def upload_pdb(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdb"):
        raise HTTPException(status_code=400, detail="Hanya file .pdb yang diterima")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Ukuran file maksimal 5 MB")

    name = re.sub(r"\.pdb$", "", file.filename, flags=re.IGNORECASE).upper()
    return JSONResponse({
        "pdb_data": content.decode("utf-8", errors="replace"),
        "meta": {
            "id"        : name,
            "title"     : file.filename,
            "method"    : "—",
            "resolution": None,
            "chains"    : "—",
            "atoms"     : "—",
            "date"      : "—",
        },
    })


# Static files harus di-mount paling akhir
app.mount("/", StaticFiles(directory="static", html=True), name="static")
