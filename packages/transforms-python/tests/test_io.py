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
    pq.write_table(ROWS, tmp_path / "sample.parquet")

    source = TransformInput(rid="ri.catalog.main.dataset.x", sequence=1, directory=tmp_path)
    ctx = TransformContext(inputs={"source": source}, job_rid=None, log=None)

    assert source.polars().shape == (3, 2)
    assert source.polars(lazy=True).collect().shape == (3, 2)
    assert source.arrow().num_rows == 3
    assert ctx.duckdb().conn.execute("SELECT count(*) FROM source").fetchall() == [(3,)]


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

