from __future__ import annotations

import json
from pathlib import Path
from threading import Lock

from .schemas import WorkspaceState


class JsonStore:
    def __init__(self, data_path: Path):
        self.data_path = data_path
        self.lock = Lock()
        self.data_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.data_path.exists():
            self.save(WorkspaceState())

    def load(self) -> WorkspaceState:
        with self.lock:
            raw = json.loads(self.data_path.read_text(encoding="utf-8"))
        return WorkspaceState.model_validate(raw)

    def save(self, state: WorkspaceState) -> WorkspaceState:
        with self.lock:
            self.data_path.write_text(
                state.model_dump_json(indent=2),
                encoding="utf-8",
            )
        return state

    def update(self, mutator):
        with self.lock:
            raw = json.loads(self.data_path.read_text(encoding="utf-8")) if self.data_path.exists() else {}
            state = WorkspaceState.model_validate(raw or {})
            mutator(state)
            self.data_path.write_text(state.model_dump_json(indent=2), encoding="utf-8")
            return state
