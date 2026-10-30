"""Preview: a transform as it is in the working copy, on samples of its inputs. Writes no dataset.

    python -m quarry.transforms.preview --list
    python -m quarry.transforms.preview <transform name> [--rows 1000]

Run in the workspace's root, with QUARRY_SERVER_URL and QUARRY_TOKEN set (the
session's). Prints one JSON object to stdout — the transforms, or the preview's
result, or {"error": …} with exit code 1. The transform's own prints and `ctx.log`
lines come back as `logs`, never on stdout.
"""

from __future__ import annotations

import argparse
import contextlib
import importlib
import io
import json
import logging
import sys
import tempfile
import traceback
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any

import pyarrow as pa

from .api import Pipeline, Transform
from .client import QuarryClient
from .io import TransformContext, TransformInput, TransformOutput

DEFAULT_SAMPLE_ROWS = 1000

# At most this many rows of each output come back — the IDE shows a table, not the whole result.
RETURNED_ROWS = 1000


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m quarry.transforms.preview")
    parser.add_argument("transform", nargs="?", help="the transform's name, as --list prints it")
    parser.add_argument("--list", action="store_true", help="list the workspace's transforms")
    parser.add_argument("--rows", type=int, default=DEFAULT_SAMPLE_ROWS, help="rows sampled from each input")
    arguments = parser.parse_args()

    try:
        pipeline = load_pipeline(Path.cwd())

        if arguments.list or not arguments.transform:
            result: dict[str, Any] = {"transforms": [describe(candidate) for candidate in pipeline.transforms.values()]}
        else:
            result = preview(pipeline, arguments.transform, arguments.rows)
    except Exception as error:
        print(json.dumps({"error": {"message": str(error), "traceback": traceback.format_exc()}}))

        return 1

    print(json.dumps(result, default=json_value))

    return 0


def load_pipeline(root: Path) -> Pipeline:
    """The `pipeline` in `src/<package>/pipeline.py`, imported fresh from the working copy."""
    candidates = sorted((root / "src").glob("*/pipeline.py"))

    if not candidates:
        raise FileNotFoundError("No src/<package>/pipeline.py in this workspace")

    sys.path.insert(0, str(root / "src"))

    module = importlib.import_module(f"{candidates[0].parent.name}.pipeline")
    pipeline = getattr(module, "pipeline", None)

    if not isinstance(pipeline, Pipeline):
        raise TypeError(f"{module.__name__} has no `pipeline = Pipeline()`")

    return pipeline


def describe(candidate: Transform) -> dict[str, Any]:
    return {
        "name":    candidate.name,
        "inputs":  {name: declared.ref for name, declared in candidate.inputs.items()},
        "outputs": {name: declared.ref for name, declared in candidate.outputs.items()},
    }


def preview(pipeline: Pipeline, name: str, rows: int) -> dict[str, Any]:
    candidate = pipeline.transforms.get(name)

    if candidate is None:
        raise KeyError(f"No transform named {name}")

    client = QuarryClient()
    written: dict[str, pa.Table] = {}
    logs = PreviewLog()

    with tempfile.TemporaryDirectory(prefix="quarry-preview-") as scratch:
        inputs = {
            input_name: sample_input(client, declared.ref, rows, Path(scratch) / input_name)
            for input_name, declared in candidate.inputs.items()
        }
        outputs = {
            output_name: TransformOutput(rid=client.resolve(declared.ref), writer=collector(written, output_name))
            for output_name, declared in candidate.outputs.items()
        }

        arguments: dict[str, Any] = {**inputs, **outputs}

        if candidate.takes_context:
            arguments["ctx"] = TransformContext(inputs=inputs, job_rid=None, log=logs.logger)

        with contextlib.redirect_stdout(logs.stream):
            candidate.function(**arguments)

    missing = [output_name for output_name, output in outputs.items() if not output.written]

    if missing:
        raise RuntimeError(f"{candidate.name} didn't write {', '.join(missing)}")

    return {
        "transform": candidate.name,
        "inputs":    {input_name: {"rid": handle.rid, "sequence": handle.sequence} for input_name, handle in inputs.items()},
        "outputs":   {output_name: table_result(table) for output_name, table in written.items()},
        "logs":      logs.lines(),
    }


def sample_input(client: QuarryClient, ref: str, rows: int, directory: Path) -> TransformInput:
    rid = client.resolve(ref)

    if rid is None:
        raise LookupError(f"Input {ref} doesn't exist, or you can't see it")

    directory.mkdir(parents=True)

    sequence = client.sample(rid, rows, directory / "sample.parquet")

    return TransformInput(rid=rid, sequence=sequence, files=[str(directory / "sample.parquet")])


def collector(written: dict[str, pa.Table], name: str):
    def write(reader: pa.RecordBatchReader) -> None:
        written[name] = reader.read_all()

    return write


def table_result(table: pa.Table) -> dict[str, Any]:
    """Columns with Quarry's types, and the first rows — one list per row, in column order."""
    head = table.slice(0, RETURNED_ROWS)

    return {
        "columns":  [{"name": field.name, "type": column_type(field.type)} for field in table.schema],
        "rows":     [list(row.values()) for row in head.to_pylist()],
        "rowCount": table.num_rows,
    }


def column_type(arrow_type: pa.DataType) -> str:
    """Arrow types onto the dataset type system (Catalog.ColumnSchema.Type), as Quarry maps DuckDB's."""
    if pa.types.is_decimal(arrow_type):
        return f"decimal({arrow_type.precision},{arrow_type.scale})"

    if pa.types.is_int8(arrow_type) or pa.types.is_int16(arrow_type) or pa.types.is_int32(arrow_type):
        return "integer"

    if pa.types.is_uint8(arrow_type) or pa.types.is_uint16(arrow_type):
        return "integer"

    if pa.types.is_int64(arrow_type) or pa.types.is_uint32(arrow_type) or pa.types.is_uint64(arrow_type):
        return "long"

    if pa.types.is_floating(arrow_type):
        return "double"

    if pa.types.is_boolean(arrow_type):
        return "boolean"

    if pa.types.is_date(arrow_type):
        return "date"

    if pa.types.is_timestamp(arrow_type):
        return "timestamp"

    if pa.types.is_binary(arrow_type) or pa.types.is_large_binary(arrow_type):
        return "binary"

    return "string"


def json_value(value: Any) -> Any:
    """Cell values JSON can't carry as is."""
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()

    if isinstance(value, Decimal):
        return str(value)

    if isinstance(value, bytes):
        return value.hex()

    return str(value)


class PreviewLog:
    """The transform's prints and `ctx.log` lines, in order."""

    def __init__(self):
        self.stream = io.StringIO()
        self.logger = logging.getLogger("quarry.transforms.preview.user")
        self.logger.setLevel(logging.INFO)
        self.logger.propagate = False

        handler = logging.StreamHandler(self.stream)
        handler.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
        self.logger.addHandler(handler)

    def lines(self) -> list[str]:
        return [line for line in self.stream.getvalue().splitlines() if line]


if __name__ == "__main__":
    sys.exit(main())
