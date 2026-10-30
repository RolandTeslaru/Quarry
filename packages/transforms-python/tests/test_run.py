import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from quarry.transforms import TransformOutput, run

SRC = Path(__file__).resolve().parents[1] / "src"

PIPELINE = """
    from quarry.transforms import Pipeline

    from sales import datasets

    pipeline = Pipeline()
    pipeline.discover_transforms(datasets)
"""


def run_job(root: Path, name: str, body: str) -> tuple[subprocess.CompletedProcess[str], list[dict]]:
    """`python -m quarry.transforms.run job.json` in the workspace's root, as the runtime runs it: its events on a pipe."""
    transform = textwrap.indent(textwrap.dedent(body).strip(), "    ")
    files = {
        "src/sales/__init__.py": "",
        "src/sales/pipeline.py": textwrap.dedent(PIPELINE),
        "src/sales/datasets/__init__.py": "",
        "src/sales/datasets/orders.py": (
            "from quarry.transforms import Input, Output, transform\n\n"
            '@transform.using(raw=Input("/Sales/raw/orders"), out=Output("/Sales/clean/orders"))\n'
            f"def clean(raw, out):\n{transform}\n"
        ),
    }

    for file, contents in files.items():
        path = root / file
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents)

    part_0 = root / "part-0.parquet"
    part_1 = root / "part-1.parquet"

    pq.write_table(pa.table({"id": [1, 2]}), part_0)
    pq.write_table(pa.table({"id": [3]}), part_1)

    job = {
        "jobRid":    "ri.forge.main.job.x",
        "transform": name,
        "inputs":    {
            "raw": {
                "rid":      "ri.catalog.main.dataset.raw",
                "sequence": 4,
                "files":    [str(part_0), str(part_1)],
                "schema":   None,
            },
        },
        "outputs":   {
            "out": {
                "rid":       "ri.catalog.main.dataset.out",
                "directory": str(root / "out" / "out"),
            },
        },
    }

    (root / "job.json").write_text(json.dumps(job))

    read, write = os.pipe()

    result = subprocess.run(
        [sys.executable, "-m", "quarry.transforms.run", str(root / "job.json")],
        cwd=root,
        env={**os.environ, "PYTHONPATH": str(SRC), "QUARRY_EVENTS_FD": str(write)},
        pass_fds=(write,),
        capture_output=True,
        text=True,
        check=False,
    )

    os.close(write)

    with os.fdopen(read) as events:
        return result, [json.loads(line) for line in events]


def test_runs_the_transform_and_announces_each_file_it_writes(tmp_path):
    result, events = run_job(tmp_path, "sales.datasets.orders.clean", """
        print(f"rows {raw.polars(lazy=True).collect().height}")
        out.write_table(raw.polars(lazy=True))
    """)

    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines() == ["rows 3", "Ran sales.datasets.orders.clean"]

    written = tmp_path / "out" / "out" / "part-0.parquet"

    assert events == [{"type": "event", "event": "file-ready", "output": "out", "path": str(written)}]
    assert pq.read_table(written).num_rows == 3


def test_fails_when_an_output_isnt_written(tmp_path):
    result, events = run_job(tmp_path, "sales.datasets.orders.clean", "pass")

    assert result.returncode == 1
    assert "sales.datasets.orders.clean didn't write out" in result.stderr
    assert events == []


def test_fails_on_a_transform_the_commit_doesnt_have(tmp_path):
    result, _ = run_job(tmp_path, "sales.datasets.orders.gone", "pass")

    assert result.returncode == 1
    assert "No transform named sales.datasets.orders.gone at this commit" in result.stderr


class Events:
    """Stands in for the events pipe: collects what's announced."""

    def __init__(self):
        self.lines = []

    def write(self, line):
        self.lines.append(json.loads(line))

    def flush(self):
        pass


def test_rolls_an_output_into_several_files(tmp_path, monkeypatch):
    monkeypatch.setattr(run, "FILE_BYTES", 1)                  # every batch starts a new file
    events = Events()
    write = run.file_writer("out", tmp_path, events)

    write(pa.table({"id": list(range(5))}).to_reader(max_chunksize=2))

    paths = [event["path"] for event in events.lines]

    assert paths == [str(tmp_path / f"part-{index}.parquet") for index in range(3)]
    assert [pq.read_table(path).num_rows for path in paths] == [2, 2, 1]
    assert list(tmp_path.glob("*.tmp")) == []


def test_writes_an_empty_output_as_one_file_with_its_columns(tmp_path):
    events = Events()
    write = run.file_writer("out", tmp_path, events)

    write(pa.table({"id": pa.array([], pa.int64())}).to_reader())

    written = pq.read_table(tmp_path / "part-0.parquet")

    assert len(events.lines) == 1
    assert written.num_rows == 0
    assert written.schema.names == ["id"]


def test_an_output_is_written_once():
    output = TransformOutput(rid="ri.catalog.main.dataset.out", writer=lambda reader: reader.read_all())

    output.write_table(pa.table({"id": [1]}))

    with pytest.raises(RuntimeError, match="already written"):
        output.write_table(pa.table({"id": [2]}))
