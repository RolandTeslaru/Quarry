"""The Quarry API, as transforms need it: library paths to RIDs, and dataset samples."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RID = re.compile(r"^ri\.[a-z][a-z0-9-]*\.main\.[a-z][a-z0-9-]*\.[0-9a-f-]{36}$")

REQUEST_TIMEOUT_SECONDS = 120


class QuarryError(Exception):
    """A request the server refused — its message, as the server said it, and the HTTP status."""

    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.status = status


class QuarryClient:
    """Calls the server as the session's user: QUARRY_SERVER_URL and QUARRY_TOKEN from the environment."""

    def __init__(self, server_url: str | None = None, token: str | None = None):
        self._server_url = (server_url or os.environ["QUARRY_SERVER_URL"]).rstrip("/")
        self._token = token or os.environ["QUARRY_TOKEN"]

    def resolve(self, ref: str) -> str | None:
        """A RID as is; a library path to the RID of what's there — None if nothing is (or it's hidden)."""
        if RID.match(ref):
            return ref

        query = urllib.parse.urlencode({"path": ref})

        try:
            body = self._request(f"/api/resources/by-path?{query}")
        except QuarryError as error:
            if error.status == 404:
                return None

            raise

        return json.loads(body)["resource"]["rid"]

    def sample(self, dataset_rid: str, rows: int, destination: Path) -> int:
        """A random sample of the dataset's latest version, written as one Parquet file. Returns the version."""
        request = self._open(f"/api/datasets/{dataset_rid}/sample?rows={rows}")

        with request as response:
            destination.write_bytes(response.read())

            return int(response.headers.get("X-Quarry-Sequence", "0"))

    def _request(self, path: str) -> bytes:
        with self._open(path) as response:
            return response.read()

    def _open(self, path: str):
        request = urllib.request.Request(
            f"{self._server_url}{path}",
            headers={"Authorization": f"Bearer {self._token}"},
        )

        try:
            return urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS)
        except urllib.error.HTTPError as error:
            raise QuarryError(_message(error), error.code) from None


def _message(error: urllib.error.HTTPError) -> str:
    try:
        return json.loads(error.read())["message"]
    except (ValueError, KeyError, TypeError):
        return f"HTTP {error.code}"
