import types

import pytest

from quarry.transforms import Input, Output, Pipeline, Resources, transform


def test_inputs_and_outputs_are_split_by_kind():
    @transform.using(orders=Input("/Sales/raw/orders"), out=Output("/Sales/clean/orders"))
    def clean(orders, out):
        pass

    assert list(clean.inputs) == ["orders"]
    assert list(clean.outputs) == ["out"]
    assert clean.resources == Resources()
    assert clean.takes_context is False


def test_ctx_first_is_the_context():
    @transform.using(orders=Input("/a"), out=Output("/b"))
    def clean(ctx, orders, out):
        pass

    assert clean.takes_context is True


def test_parameters_must_match_the_declaration():
    with pytest.raises(TypeError, match="missing: \\['out'\\]"):
        @transform.using(orders=Input("/a"), out=Output("/b"))
        def clean(orders):
            pass


def test_references_are_dataset_rids_or_library_paths():
    assert Input("ri.catalog.main.dataset.01a1729a-975b-70de-8141-89cca28b34d2").ref.startswith("ri.")
    assert Output("/Sales/clean/orders").ref == "/Sales/clean/orders"

    for ref in ["orders", "//Sales", "ri.code-workspace.main.workspace.01a1729a-975b-70de-8141-89cca28b34d2"]:
        with pytest.raises(ValueError, match="isn't a dataset RID"):
            Input(ref)


def test_a_transform_needs_an_output():
    with pytest.raises(ValueError, match="at least one Output"):
        transform.using(orders=Input("/a"))


def test_with_resources_overrides_only_what_it_names():
    @transform.using(out=Output("/b")).with_resources(cpu_cores=4)
    def build(out):
        pass

    assert build.resources == Resources(cpu_cores=4, memory_gb=4)


def test_pipeline_discovers_transforms_in_a_module():
    module = types.ModuleType("workspace_datasets")

    @transform.using(out=Output("/b"))
    def build(out):
        pass

    module.build = build

    pipeline = Pipeline()
    pipeline.discover_transforms(module)

    assert list(pipeline.transforms.values()) == [build]
