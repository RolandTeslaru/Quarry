import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

SRC = Path(__file__).resolve().parents[1] / "src"

WORKSPACE = {
    "src/sales/__init__.py": "",
    "src/sales/pipeline.py": """
        from quarry.transforms import Pipeline

        from sales import datasets

        pipeline = Pipeline()
        pipeline.discover_transforms(datasets)
    """,
    "src/sales/datasets/__init__.py": "",
    "src/sales/datasets/orders.py": """
        from quarry.transforms import Input, Output, transform

        @transform.using(raw=Input("/Sales/raw/orders"), out=Output("/Sales/clean/orders"))
        def clean(raw, out):
            print(f"rows {raw.polars(lazy=True).collect().height}")
            out.write_table(raw.polars())
    """,
}


def run_transform(root: Path, name: str) -> subprocess.CompletedProcess[str]:
    """`python -m quarry.transforms.run job.json` in the workspace's root, as the runtime runs it."""
    for file, contents in WORKSPACE.items():
        path = root / file
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(textwrap.dedent(contents))

    part_0 = root / "part-0.parquet"
    part_1 = root / "part-1.parquet"

    pq.write_table(pa.table({"id": [1, 2]}), part_0)
    pq.write_table(pa.table({"id": [3]}), part_1)

    job = {
        "jobRid":    "ri.forge.main.job.x",
        "transform": name,
        "inputs":    {"raw": {"rid": "ri.catalog.main.dataset.raw", "sequence": 4, "files": [str(part_0), str(part_1)]}},
        "outputs":   {"out": {"rid": "ri.catalog.main.dataset.out"}},
    }

    (root / "job.json").write_text(json.dumps(job))

    return subprocess.run(
        [sys.executable, "-m", "quarry.transforms.run", str(root / "job.json")],
        cwd=root,
        env={**os.environ, "PYTHONPATH": str(SRC)},
        capture_output=True,
        text=True,
        check=False,
    )


def test_runs_the_transform_on_its_inputs_files(tmp_path):
    result = run_transform(tmp_path, "sales.datasets.orders.clean")

    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines() == ["rows 3", "Ran sales.datasets.orders.clean"]


def test_fails_on_a_transform_the_commit_doesnt_have(tmp_path):
    result = run_transform(tmp_path, "sales.datasets.orders.gone")

    assert result.returncode == 1
    assert "No transform named sales.datasets.orders.gone at this commit" in result.stderr
