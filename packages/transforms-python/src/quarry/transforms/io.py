"""What a transform's function receives: input and output handles, and the context."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Callable

import duckdb
import polars as pl
import pyarrow as pa
import pyarrow.dataset as ds


class TransformInput:
    """One input, pinned to one version: every loader reads the same files."""

    def __init__(self, *, rid: str, sequence: int, directory: Path):
        self.rid = rid
        self.sequence = sequence
        self._directory = directory

    def path(self) -> str:
        """The directory of this version's Parquet files — for any other engine."""
        return str(self._directory)

    def polars(self, lazy: bool = False) -> pl.DataFrame | pl.LazyFrame:
        frame = pl.scan_parquet(self._files())

        return frame if lazy else frame.collect()

    def pandas(self) -> Any:
        return self.arrow().to_pandas()

    def arrow(self) -> pa.Table:
        return ds.dataset(self._directory, format="parquet").to_table()

    def _files(self) -> str:
        return str(self._directory / "*.parquet")


class TransformOutput:
    """One output: `write_table` takes Polars, pandas, Arrow or a DuckDB relation."""

    def __init__(self, *, rid: str | None, writer: Callable[[pa.Table], None]):
        self.rid = rid
        self.written = False
        self._writer = writer

    def write_table(self, data: Any) -> None:
        self._writer(to_arrow(data))
        self.written = True


class DuckDbContext:
    """A DuckDB connection with every input registered as a view, under its parameter name."""

    def __init__(self, inputs: dict[str, TransformInput]):
        self.conn = duckdb.connect()

        for name, transform_input in inputs.items():
            files = str(Path(transform_input.path()) / "*.parquet").replace("'", "''")

            self.conn.execute(f"CREATE VIEW \"{name}\" AS SELECT * FROM read_parquet('{files}')")


class TransformContext:
    """`ctx` — for a function whose first parameter is `ctx`."""

    def __init__(self, *, inputs: dict[str, TransformInput], job_rid: str | None, log: logging.Logger):
        self.job_rid = job_rid
        self.log = log
        self._inputs = inputs
        self._duckdb: DuckDbContext | None = None

    def duckdb(self) -> DuckDbContext:
        if self._duckdb is None:
            self._duckdb = DuckDbContext(self._inputs)

        return self._duckdb


def to_arrow(data: Any) -> pa.Table:
    """Whatever a transform wrote, as an Arrow table."""
    if isinstance(data, pa.Table):
        return data

    if isinstance(data, pl.DataFrame):
        return data.to_arrow()

    if isinstance(data, pl.LazyFrame):
        return data.collect().to_arrow()

    if isinstance(data, duckdb.DuckDBPyRelation):
        return data.fetch_arrow_table()

    if isinstance(data, pa.RecordBatchReader):
        return data.read_all()

    if type(data).__module__.startswith("pandas"):
        return pa.Table.from_pandas(data, preserve_index=False)

    raise TypeError(f"write_table takes a Polars, pandas, Arrow or DuckDB table, not {type(data).__name__}")
