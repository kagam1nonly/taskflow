from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


class Board(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    owner_id: str = Field(index=True)
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class Column(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    board_id: UUID = Field(foreign_key="board.id", index=True)
    title: str
    position: int = Field(default=0, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class Task(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    board_id: UUID = Field(foreign_key="board.id", index=True)
    column_id: UUID = Field(foreign_key="column.id", index=True)
    title: str
    description: Optional[str] = None
    position: int = Field(default=0, index=True)
    status: str = Field(default="todo", index=True)
    created_by: str = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
