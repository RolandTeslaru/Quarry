import os
import subprocess
import sys
import textwrap
from pathlib import Path

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
            pass
    """,
}


def run_transform(root: Path, name: str) -> subprocess.CompletedProcess[str]:
    """`python -m quarry.transforms.run` in the workspace's root, as the runtime runs it."""
    for file, contents in WORKSPACE.items():
        path = root / file
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(textwrap.dedent(contents))

    return subprocess.run(
        [sys.executable, "-m", "quarry.transforms.run", name],
        cwd=root,
        env={**os.environ, "PYTHONPATH": str(SRC)},
        capture_output=True,
        text=True,
        check=False,
    )


def test_finds_the_transform(tmp_path):
    result = run_transform(tmp_path, "sales.datasets.orders.clean")

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "Found sales.datasets.orders.clean"


def test_fails_on_a_transform_the_commit_doesnt_have(tmp_path):
    result = run_transform(tmp_path, "sales.datasets.orders.gone")

    assert result.returncode == 1
    assert "No transform named sales.datasets.orders.gone at this commit" in result.stderr
