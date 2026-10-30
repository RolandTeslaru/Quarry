"""One transform, as a Forge job runs it (docs/design/forge-runtimes.md).

    python -m quarry.transforms.run <job.json>

Run by the runtime, as the transform user, in the workspace's checkout at the
recipe's commit. The job file names the transform, and gives each input
parameter its pinned version's files as signed URLs. Imports the pipeline and
calls the transform; if anything fails, exits 1 with the reason on stderr.
Outputs aren't written yet: what the transform writes is dropped.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import pyarrow as pa

from .io import TransformContext, TransformInput, TransformOutput
from .preview import load_pipeline


def main() -> int:
    job = json.loads(Path(sys.argv[1]).read_text())
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
        )
        for name in candidate.inputs
    }
    outputs = {
        name: TransformOutput(rid=job["outputs"][name]["rid"], writer=drop)
        for name in candidate.outputs
    }

    arguments = {**inputs, **outputs}

    if candidate.takes_context:
        logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(message)s")

        arguments["ctx"] = TransformContext(inputs=inputs, job_rid=job["jobRid"], log=logging.getLogger(candidate.name))

    candidate.function(**arguments)

    print(f"Ran {candidate.name}")

    return 0


def drop(table: pa.Table) -> None:
    """Where outputs go until writing is built: nowhere."""


if __name__ == "__main__":
    sys.exit(main())
