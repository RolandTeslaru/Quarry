import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"


def write_workspace(root: Path, files: dict[str, str]) -> None:
    for name, contents in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(textwrap.dedent(contents))


def run_manifest(root: Path) -> subprocess.CompletedProcess[str]:
    """`python -m quarry.transforms.manifest` in the workspace's root, as the check container runs it."""
    return subprocess.run(
        [sys.executable, "-m", "quarry.transforms.manifest"],
        cwd=root,
        env={**os.environ, "PYTHONPATH": str(SRC)},
        capture_output=True,
        text=True,
        check=False,
    )


PIPELINE = """
    from quarry.transforms import Pipeline

    from {package} import datasets

    pipeline = Pipeline()
    pipeline.discover_transforms(datasets)
"""


def test_describes_every_transform_with_its_resources(tmp_path):
    write_workspace(tmp_path, {
        "src/sales/__init__.py": "",
        "src/sales/pipeline.py": PIPELINE.format(package="sales"),
        "src/sales/datasets/__init__.py": "",
        "src/sales/datasets/orders.py": """
            from quarry.transforms import Input, Output, transform

            @transform.using(raw=Input("/Sales/raw/orders"), out=Output("/Sales/clean/orders"))
            def clean(raw, out):
                pass

            @transform.using(
                orders=Input("/Sales/clean/orders"),
                out=Output("ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d2"),
            ).with_resources(cpu_cores=4, memory_gb=16)
            def summary(orders, out):
                pass
        """,
    })

    result = run_manifest(tmp_path)

    assert result.returncode == 0, result.stderr
    manifest = json.loads(result.stdout)
    by_name = {transform["name"]: transform for transform in manifest["transforms"]}

    assert by_name["sales.datasets.orders.clean"] == {
        "name":      "sales.datasets.orders.clean",
        "inputs":    {"raw": "/Sales/raw/orders"},
        "outputs":   {"out": "/Sales/clean/orders"},
        "resources": {"cpuCores": 1, "memoryGb": 4},
    }
    assert by_name["sales.datasets.orders.summary"]["outputs"] == {"out": "ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d2"}
    assert by_name["sales.datasets.orders.summary"]["resources"] == {"cpuCores": 4, "memoryGb": 16}


def test_prints_nothing_but_the_manifest_on_stdout(tmp_path):
    write_workspace(tmp_path, {
        "src/noisy/__init__.py": "",
        "src/noisy/pipeline.py": PIPELINE.format(package="noisy"),
        "src/noisy/datasets/__init__.py": "",
        "src/noisy/datasets/a.py": """
            from quarry.transforms import Output, transform

            @transform.using(out=Output("/A/out"))
            def build(out):
                pass
        """,
    })

    result = run_manifest(tmp_path)

    assert json.loads(result.stdout) == {"transforms": [{
        "name": "noisy.datasets.a.build", "inputs": {}, "outputs": {"out": "/A/out"}, "resources": {"cpuCores": 1, "memoryGb": 4},
    }]}


def test_an_empty_pipeline_is_an_empty_manifest(tmp_path):
    write_workspace(tmp_path, {
        "src/empty/__init__.py": "",
        "src/empty/pipeline.py": "from quarry.transforms import Pipeline\n\npipeline = Pipeline()\n",
    })

    result = run_manifest(tmp_path)

    assert result.returncode == 0
    assert json.loads(result.stdout) == {"transforms": []}


def test_a_pipeline_that_doesnt_import_exits_1_with_its_traceback_on_stderr(tmp_path):
    write_workspace(tmp_path, {
        "src/broken/__init__.py": "",
        "src/broken/pipeline.py": "import does_not_exist\n",
    })

    result = run_manifest(tmp_path)

    assert result.returncode == 1
    assert result.stdout == ""
    assert "ModuleNotFoundError" in result.stderr
    assert "does_not_exist" in result.stderr


def test_a_workspace_without_a_pipeline_exits_1(tmp_path):
    result = run_manifest(tmp_path)

    assert result.returncode == 1
    assert result.stdout == ""
    assert "No src/<package>/pipeline.py" in result.stderr
