"""Declaring transforms: `@transform.using(...)`, `Input`, `Output`, and the `Pipeline` that finds them."""

from __future__ import annotations

import importlib
import inspect
import pkgutil
import re
from dataclasses import dataclass, replace
from types import ModuleType
from typing import Callable

CONTEXT_PARAMETER = "ctx"

# Mirrors CodeTransform.DatasetReference.
DATASET_RID = re.compile(r"^ri\.catalog\.main\.dataset\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
LIBRARY_PATH = re.compile(r"^/[^/]")


class Input:
    """A dataset the transform reads — a library path (`/Project/folder/name`) or a RID."""

    def __init__(self, ref: str):
        self.ref = _check_reference(ref)

    def __repr__(self) -> str:
        return f"Input({self.ref!r})"


class Output:
    """A dataset the transform writes — a library path or a RID. Checks create it if it doesn't exist."""

    def __init__(self, ref: str):
        self.ref = _check_reference(ref)

    def __repr__(self) -> str:
        return f"Output({self.ref!r})"


@dataclass(frozen=True)
class Resources:
    """How much machine a build job gets."""

    cpu_cores: float = 1
    memory_gb: float = 4


class Transform:
    """A function with its inputs, outputs and resources — what `@transform.using(...)` makes of it."""

    def __init__(
        self,
        function: Callable[..., None],
        inputs: dict[str, Input],
        outputs: dict[str, Output],
        resources: Resources,
    ):
        self.function = function
        self.inputs = inputs
        self.outputs = outputs
        self.resources = resources
        self.name = f"{function.__module__}.{function.__qualname__}"
        self.takes_context = _check_parameters(function, inputs, outputs)

    def __repr__(self) -> str:
        return f"Transform({self.name})"


class TransformBuilder:
    """`transform.using(...)`, before it's applied to a function: `.with_resources(...)` can still change it."""

    def __init__(self, inputs: dict[str, Input], outputs: dict[str, Output], resources: Resources):
        self._inputs = inputs
        self._outputs = outputs
        self._resources = resources

    def with_resources(self, cpu_cores: float | None = None, memory_gb: float | None = None) -> TransformBuilder:
        resources = self._resources

        if cpu_cores is not None:
            resources = replace(resources, cpu_cores=cpu_cores)

        if memory_gb is not None:
            resources = replace(resources, memory_gb=memory_gb)

        return TransformBuilder(self._inputs, self._outputs, resources)

    def __call__(self, function: Callable[..., None]) -> Transform:
        return Transform(function, self._inputs, self._outputs, self._resources)


class _TransformDecorators:
    """`transform` — `@transform.using(orders=Input(...), out=Output(...))`."""

    def using(self, **parameters: Input | Output) -> TransformBuilder:
        inputs: dict[str, Input] = {}
        outputs: dict[str, Output] = {}

        for name, parameter in parameters.items():
            if isinstance(parameter, Input):
                inputs[name] = parameter
            elif isinstance(parameter, Output):
                outputs[name] = parameter
            else:
                raise TypeError(f"'{name}' must be an Input(...) or an Output(...), not {type(parameter).__name__}")

        if not outputs:
            raise ValueError("A transform needs at least one Output(...)")

        return TransformBuilder(inputs, outputs, Resources())


transform = _TransformDecorators()


class Pipeline:
    """Every transform in a code workspace, by name — `pipeline.py` builds one."""

    def __init__(self):
        self.transforms: dict[str, Transform] = {}

    def add_transforms(self, *transforms: Transform) -> None:
        for candidate in transforms:
            self.transforms[candidate.name] = candidate

    def discover_transforms(self, *packages: ModuleType) -> None:
        """Imports every module under the packages and adds each transform they define."""
        for package in packages:
            for module in _modules(package):
                self.add_transforms(*(value for value in vars(module).values() if isinstance(value, Transform)))


def _modules(package: ModuleType) -> list[ModuleType]:
    modules = [package]

    if hasattr(package, "__path__"):
        for info in pkgutil.walk_packages(package.__path__, prefix=f"{package.__name__}."):
            modules.append(importlib.import_module(info.name))

    return modules


def _check_reference(ref: str) -> str:
    if not isinstance(ref, str) or not (DATASET_RID.match(ref) or LIBRARY_PATH.match(ref)):
        raise ValueError(f"{ref!r} isn't a dataset RID (ri.catalog.main.dataset.…) or a library path (/Project/folder/name)")

    return ref


def _check_parameters(function: Callable[..., None], inputs: dict[str, Input], outputs: dict[str, Output]) -> bool:
    """The function's parameters must be exactly its inputs and outputs, after an optional `ctx`. Returns whether it takes `ctx`."""
    names = list(inspect.signature(function).parameters)
    takes_context = bool(names) and names[0] == CONTEXT_PARAMETER

    if takes_context:
        names = names[1:]

    declared = set(inputs) | set(outputs)

    if set(names) != declared:
        missing = sorted(declared - set(names))
        extra = sorted(set(names) - declared)

        raise TypeError(
            f"{function.__qualname__}'s parameters must match its inputs and outputs"
            f" (missing: {missing or 'none'}, undeclared: {extra or 'none'})"
        )

    return takes_context
