"""One transform, as a Forge job runs it (docs/design/forge-runtimes.md).

    python -m quarry.transforms.run <job.json>

Run by the runtime, as the transform user, in the workspace's checkout at the
recipe's commit. The job file names the transform; gives each input parameter
its pinned version's files as signed URLs, with the dataset's schema (how to
read them, for CSV); and each output parameter a folder to write into.

Each output is written as Parquet files of about FILE_BYTES, and each file is
announced to the runtime once it's complete, on the file descriptor named by
QUARRY_EVENTS_FD — the runtime uploads it while the next is written. Exits 1,
with the reason on stderr, if anything fails or an output isn't written.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from typing import TextIO

import pyarrow as pa
import pyarrow.parquet as pq

from .io import TransformContext, TransformInput, TransformOutput
from .preview import load_pipeline

# About how big a file grows before the next starts: big to read, small enough to upload while the next is written.
FILE_BYTES = 256 * 1024 * 1024


def main() -> int:
    job = json.loads(Path(sys.argv[1]).read_text())
    events = os.fdopen(int(os.environ["QUARRY_EVENTS_FD"]), "w")
    pipeline = load_pipeline(Path.cwd())
    candidate = pipeline.transforms.get(job["transform"])

    if candidate is None:
        print(f"No transform named {job['transform']} at this commit", file=sys.stderr)

        return 1

    inputs = {
        name: TransformInput(
            rid=job["inputs"][name]["rid"],
            sequence=job["inputs"][name]["sequence"],
            files=job["inputs"][name]["files"],
            schema=job["inputs"][name]["schema"],
        )
        for name in candidate.inputs
    }
    outputs = {}

    for name in candidate.outputs:
        directory = Path(job["outputs"][name]["directory"])

        outputs[name] = TransformOutput(rid=job["outputs"][name]["rid"], writer=file_writer(name, directory, events))

    arguments = {**inputs, **outputs}

    if candidate.takes_context:
        logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(message)s")

        arguments["ctx"] = TransformContext(inputs=inputs, job_rid=job["jobRid"], log=logging.getLogger(candidate.name))

    candidate.function(**arguments)

    unwritten = [name for name, output in outputs.items() if not output.written]

    if unwritten:
        print(f"{candidate.name} didn't write {', '.join(unwritten)}", file=sys.stderr)

        return 1

    print(f"Ran {candidate.name}")

    return 0


def file_writer(output: str, directory: Path, events: TextIO):
    """An output's stream as Parquet files of about FILE_BYTES: at least one, so even an empty output has a schema."""

    def write(reader: pa.RecordBatchReader) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        part: Part | None = None
        written = 0

        for batch in reader:
            if part is None:
                part = Part(output, directory, written, reader.schema, events)

            part.writer.write_batch(batch)

            if part.sink.tell() >= FILE_BYTES:
                part.finish()
                part = None
                written += 1

        # The last file, or — for an output with no rows — one empty file with its columns.
        if part is None and written == 0:
            part = Part(output, directory, 0, reader.schema, events)

        if part is not None:
            part.finish()

    return write


class Part:
    """One file being written: `.tmp` until complete, then renamed and announced, so it's never uploaded half-done."""

    def __init__(self, output: str, directory: Path, index: int, schema: pa.Schema, events: TextIO):
        self.output = output
        self.path = directory / f"part-{index}.parquet"
        self.sink = open(self.path.with_suffix(".parquet.tmp"), "wb")
        self.writer = pq.ParquetWriter(self.sink, schema)
        self._events = events

    def finish(self) -> None:
        self.writer.close()
        self.sink.close()

        self.path.with_suffix(".parquet.tmp").rename(self.path)

        event = {
            "type":   "event",
            "event":  "file-ready",
            "output": self.output,
            "path":   str(self.path),
        }

        self._events.write(json.dumps(event) + "\n")
        self._events.flush()


if __name__ == "__main__":
    sys.exit(main())
