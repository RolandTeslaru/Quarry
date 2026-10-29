"""One transform, as a Forge job runs it (docs/design/forge-runtimes.md).

    python -m quarry.transforms.run <transform name>

Run by the runtime, as the transform user, in the workspace's checkout at the
recipe's commit. Imports the pipeline and finds the transform; if either fails,
exits 1 with the reason on stderr. It doesn't read or write data yet.
"""

from __future__ import annotations

import sys
from pathlib import Path

from .preview import load_pipeline


def main() -> int:
    name = sys.argv[1]
    pipeline = load_pipeline(Path.cwd())

    if name not in pipeline.transforms:
        print(f"No transform named {name} at this commit", file=sys.stderr)

        return 1

    print(f"Found {name}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
