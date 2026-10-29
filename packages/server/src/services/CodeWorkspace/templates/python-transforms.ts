import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TemplateParams, WorkspaceTemplate } from './template';

const run = promisify(execFile);

/** Locking resolves against PyPI; past this the create fails rather than hang. */
const UV_LOCK_TIMEOUT_MS = 120_000;

/**
 * Python transforms (docs/design/transforms.md §3): a uv project with one
 * example transform. quarry.transforms isn't a dependency — it comes with the
 * workspace's environment (the runtime image), as Foundry's library does.
 */
export const pythonTransforms: WorkspaceTemplate = {
    id:          'python-transforms',
    displayName: 'Python transforms',
    description: 'Polars, DuckDB and pandas transforms on datasets.',

    files: params => ({
        'pyproject.toml':                                pyproject(params),
        'quarry-ci.yml':                                 QUARRY_CI,
        'README.md':                                     readme(params),
        '.gitignore':                                    GITIGNORE,
        [`src/${params.packageName}/__init__.py`]:       '',
        [`src/${params.packageName}/pipeline.py`]:       PIPELINE,
        [`src/${params.packageName}/datasets/__init__.py`]: '',
        [`src/${params.packageName}/datasets/example.py`]:  example(params),
        'tests/test_pipeline.py':                        pipelineTest(params),
        'tests/test_example.py':                         exampleTest(params),
    }),

    prepare: async directory => {
        await run(process.env.QUARRY_UV_BIN ?? 'uv', ['lock', '--directory', directory], { timeout: UV_LOCK_TIMEOUT_MS });
    },
};

function pyproject(params: TemplateParams): string {
    return `[project]
name = "${params.projectName}"
version = "0.1.0"
description = "Transforms for ${params.workspaceName.replaceAll('"', '\\"')}"
requires-python = ">=3.12"
# quarry.transforms comes with the workspace's environment; list what your transforms import.
dependencies = [
    "polars>=1.20",
    "duckdb>=1.2",
]

[dependency-groups]
dev = [
    "pytest>=8",
]

[tool.uv]
package = false

[tool.pytest.ini_options]
pythonpath = ["src"]

[tool.basedpyright]
# "strict" flags every unannotated parameter; "standard" flags real mistakes.
typeCheckingMode = "standard"
`;
}

function readme(params: TemplateParams): string {
    return `# ${params.workspaceName}

Transforms in \`src/${params.packageName}/datasets/\`, one or more \`@transform\` per file.
\`pipeline.py\` finds them all.

- **Preview** runs a transform as it is in the editor, on a sample of its inputs. It writes nothing.
- **Dependencies:** \`uv add <package>\` in the terminal, then commit \`pyproject.toml\` and \`uv.lock\`.
- **Tests:** \`uv run pytest\`.
- **Checks:** every commit you push runs \`quarry-ci.yml\` — its steps, then publishing your transforms so they can be built.
`;
}

const GITIGNORE = `.venv/
__pycache__/
.pytest_cache/
`;

/** What every pushed commit goes through (docs/design/code-workspaces/checks.md §2). */
const QUARRY_CI = `# What every pushed commit goes through. The last step publishes this branch's
# transforms as recipes — what Build runs — and only if every step before it passed.
steps:
  - name: Environment
    run: uv sync --frozen

  - name: Tests
    run: pytest -q

  - name: Publish transforms
    uses: quarry/publish-transforms
`;

const PIPELINE = `from quarry.transforms import Pipeline

from . import datasets

pipeline = Pipeline()
pipeline.discover_transforms(datasets)
`;

function example(params: TemplateParams): string {
    if (!params.example)
        return `import polars as pl
from quarry.transforms import Input, Output, TransformInput, TransformOutput, transform


# An example: copies a dataset unchanged. Uncomment it, name an input dataset
# (a library path or a RID) and where the output should go, then Preview.
#
# @transform.using(
#     source=Input("/Project/folder/input"),
#     out=Output("/Project/folder/output"),
# )
# def example(source: TransformInput, out: TransformOutput):
#     df = source.polars()
#
#     out.write_table(df)
`;

    return `import polars as pl
from quarry.transforms import Input, Output, TransformInput, TransformOutput, transform


@transform.using(
    source=Input(${pythonString(params.example.inputPath)}),
    out=Output(${pythonString(params.example.outputPath)}),
)
def example(source: TransformInput, out: TransformOutput):
    """Copies the input unchanged. Replace the body with your logic, then Preview."""
    df = source.polars()

    out.write_table(df)
`;
}

/** Always there, so the Tests step always has a test: the pipeline imports, and finds its transforms. */
function pipelineTest(params: TemplateParams): string {
    return `from quarry.transforms import Pipeline

from ${params.packageName}.pipeline import pipeline


def test_the_pipeline_loads():
    assert isinstance(pipeline, Pipeline)
`;
}

function exampleTest(params: TemplateParams): string {
    const test = `import polars as pl

from ${params.packageName}.datasets.example import example


class FakeInput:
    def __init__(self, df):
        self.df = df

    def polars(self, lazy=False):
        return self.df.lazy() if lazy else self.df


class FakeOutput:
    def write_table(self, data):
        self.data = data


def test_example_copies_its_input():
    rows = pl.DataFrame({"id": [1, 2, 3]})
    out = FakeOutput()

    example.function(FakeInput(rows), out)

    assert out.data.equals(rows)
`;

    if (params.example)
        return test;

    // The example is commented out, so its test is too.
    return test
        .split('\n')
        .map(line => (line ? `# ${line}` : line))
        .join('\n');
}

/** A Python string literal — library paths can hold quotes. */
function pythonString(value: string): string {
    return JSON.stringify(value);
}
