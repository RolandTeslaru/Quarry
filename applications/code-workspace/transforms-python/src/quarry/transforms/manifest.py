"""The manifest: what a commit's transforms are, for its check run's publish step.

    python -m quarry.transforms.manifest

Run in the workspace's root by `uses: quarry/publish-transforms` (quarry-ci.yml's
last step). Imports the pipeline and describes every transform — its inputs,
outputs and resources — as one JSON object on stdout. Reads no data and resolves
nothing: the server checks every claim (docs/design/code-workspaces/checks.md §4).
A pipeline that doesn't import prints its traceback to stderr and exits 1.
"""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path
from typing import Any

from .api import Pipeline, Transform
from .preview import load_pipeline


def main() -> int:
    try:
        pipeline = load_pipeline(Path.cwd())
    except Exception:
        traceback.print_exc()

        return 1

    print(json.dumps(get_manifest(pipeline)))

    return 0


def get_manifest(pipeline: Pipeline) -> dict[str, Any]:
    """`{ transforms: [...] }`, as CodeWorkspace.CI.Check.Manifest reads it."""
    return {"transforms": [describe(candidate) for candidate in pipeline.transforms.values()]}


def describe(candidate: Transform) -> dict[str, Any]:
    return {
        "name":      candidate.name,
        "inputs":    {name: declared.ref for name, declared in candidate.inputs.items()},
        "outputs":   {name: declared.ref for name, declared in candidate.outputs.items()},
        "resources": {"cpuCores": candidate.resources.cpu_cores, "memoryGb": candidate.resources.memory_gb},
    }


if __name__ == "__main__":
    sys.exit(main())
