from decimal import Decimal

import duckdb
import polars as pl
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from quarry.transforms import TransformContext, TransformInput, TransformOutput
from quarry.transforms.io import to_arrow
from quarry.transforms.preview import column_type

ROWS = pa.table({"id": [1, 2, 3], "name": ["a", "b", "c"]})


@pytest.mark.parametrize(
    "data",
    [
        ROWS,
        pl.from_arrow(ROWS),
        pl.from_arrow(ROWS).lazy(),
        ROWS.to_pandas(),
    ],
    ids=["arrow", "polars", "polars-lazy", "pandas"],
)
def test_write_table_takes_every_engine(data):
    assert to_arrow(data).to_pylist() == ROWS.to_pylist()


def test_write_table_takes_a_duckdb_relation():
    connection = duckdb.connect()

    relation = connection.sql("SELECT * FROM (VALUES (1, 'a'), (2, 'b')) t(id, name)")

    assert to_arrow(relation).num_rows == 2


def test_write_table_refuses_anything_else():
    output = TransformOutput(rid=None, writer=lambda table: None)

    with pytest.raises(TypeError, match="not list"):
        output.write_table([1, 2])


def test_loaders_and_duckdb_read_the_same_files(tmp_path):
    pq.write_table(ROWS, tmp_path / "part-0.parquet")
    pq.write_table(ROWS, tmp_path / "part-1.parquet")

    files = [str(tmp_path / "part-0.parquet"), str(tmp_path / "part-1.parquet")]
    source = TransformInput(rid="ri.catalog.main.dataset.x", sequence=1, files=files)
    ctx = TransformContext(inputs={"source": source}, job_rid=None, log=None)

    assert source.polars().shape == (6, 2)
    assert source.polars(lazy=True).collect().shape == (6, 2)
    assert source.arrow().num_rows == 6
    assert len(source.pandas()) == 6
    assert ctx.duckdb().conn.execute("SELECT count(*) FROM source").fetchall() == [(6,)]


CSV_SCHEMA = {
    "columns": [
        {"name": "id", "type": "long", "nullable": False},
        {"name": "day", "type": "date", "nullable": True},
        {"name": "price", "type": "decimal(10,2)", "nullable": True},
        {"name": "name", "type": "string", "nullable": True},
    ],
    "reader": {"format": "csv", "delimiter": ";", "quote": '"', "escape": '"', "header": True},
}


def test_csv_inputs_are_read_with_the_datasets_schema(tmp_path):
    (tmp_path / "a.csv").write_text('id;day;price;name\n1;2026-10-01;10.50;"x; y"\n')
    (tmp_path / "b.csv").write_text("id;day;price;name\n2;2026-10-02;3.25;z\n")

    files = [str(tmp_path / "a.csv"), str(tmp_path / "b.csv")]
    source = TransformInput(rid="ri.catalog.main.dataset.x", sequence=1, files=files, schema=CSV_SCHEMA)
    ctx = TransformContext(inputs={"source": source}, job_rid=None, log=None)

    frame = source.polars(lazy=True).collect()

    assert frame.schema == {"id": pl.Int64, "day": pl.Date, "price": pl.Decimal(10, 2), "name": pl.String}
    assert frame["name"].to_list() == ["x; y", "z"]
    assert source.arrow().num_rows == 2
    assert ctx.duckdb().conn.execute("SELECT sum(price) FROM source").fetchall() == [(Decimal("13.75"),)]


def test_a_csv_dialect_polars_cant_read_fails_clearly(tmp_path):
    (tmp_path / "a.csv").write_text("id||name\n1||x\n")

    schema = {**CSV_SCHEMA, "reader": {**CSV_SCHEMA["reader"], "delimiter": "||"}}
    source = TransformInput(rid="ri.catalog.main.dataset.x", sequence=1, files=[str(tmp_path / "a.csv")], schema=schema)

    with pytest.raises(ValueError, match=r"a CSV Polars can't read: a 2-character delimiter \(\|\|\)"):
        source.polars()


@pytest.mark.parametrize(
    ("arrow_type", "expected"),
    [
        (pa.int32(), "integer"),
        (pa.int64(), "long"),
        (pa.float64(), "double"),
        (pa.bool_(), "boolean"),
        (pa.date32(), "date"),
        (pa.timestamp("us"), "timestamp"),
        (pa.decimal128(10, 2), "decimal(10,2)"),
        (pa.binary(), "binary"),
        (pa.string(), "string"),
        (pa.list_(pa.int64()), "string"),
    ],
)
def test_column_types_map_onto_quarrys(arrow_type, expected):
    assert column_type(arrow_type) == expected

