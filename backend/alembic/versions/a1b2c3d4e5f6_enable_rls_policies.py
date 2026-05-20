"""Enable Row-Level Security on board, column, task tables

Revision ID: a1b2c3d4e5f6
Revises: 052a48d72a73
Create Date: 2026-05-20

This migration:
  1. Enables RLS on board, column, and task tables.
  2. Adds USING policies so users can only SELECT/INSERT/UPDATE/DELETE
     rows they own.
  3. Grants the authenticated and service_role Postgres roles the
     necessary privileges so existing queries keep working.

NOTE: auth.uid() is a Supabase helper that returns the UUID of the
      JWT-authenticated user.  We cast it to text to match the
      owner_id / created_by text columns in our schema.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "052a48d72a73"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # ------------------------------------------------------------------
    # 1. Grant table-level privileges to the Supabase Postgres roles
    #    so that the authenticated role can execute DML.
    # ------------------------------------------------------------------
    for table in ("board", "column", "task"):
        conn.execute(
            __import__("sqlalchemy").text(
                f'GRANT SELECT, INSERT, UPDATE, DELETE ON "{table}" TO authenticated'
            )
        )
        conn.execute(
            __import__("sqlalchemy").text(
                f'GRANT ALL ON "{table}" TO service_role'
            )
        )

    # ------------------------------------------------------------------
    # 2. Enable RLS on each table
    # ------------------------------------------------------------------
    for table in ("board", "column", "task"):
        conn.execute(
            __import__("sqlalchemy").text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
        )
        # Ensure even table owners (superuser sessions) respect RLS
        conn.execute(
            __import__("sqlalchemy").text(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY')
        )

    # ------------------------------------------------------------------
    # 3. board — owner_id = auth.uid()::text
    # ------------------------------------------------------------------
    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "board_select_own"
        ON "board" FOR SELECT
        TO authenticated
        USING (owner_id = auth.uid()::text)
    """))

    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "board_insert_own"
        ON "board" FOR INSERT
        TO authenticated
        WITH CHECK (owner_id = auth.uid()::text)
    """))

    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "board_update_own"
        ON "board" FOR UPDATE
        TO authenticated
        USING (owner_id = auth.uid()::text)
        WITH CHECK (owner_id = auth.uid()::text)
    """))

    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "board_delete_own"
        ON "board" FOR DELETE
        TO authenticated
        USING (owner_id = auth.uid()::text)
    """))

    # service_role bypass (e.g. background jobs, admin panel)
    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "board_service_role_all"
        ON "board" FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)
    """))

    # ------------------------------------------------------------------
    # 4. column — access allowed if the parent board belongs to the user
    # ------------------------------------------------------------------
    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "column_select_own"
        ON "column" FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM board
                WHERE board.id = "column".board_id
                  AND board.owner_id = auth.uid()::text
            )
        )
    """))

    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "column_insert_own"
        ON "column" FOR INSERT
        TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM board
                WHERE board.id = "column".board_id
                  AND board.owner_id = auth.uid()::text
            )
        )
    """))

    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "column_update_own"
        ON "column" FOR UPDATE
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM board
                WHERE board.id = "column".board_id
                  AND board.owner_id = auth.uid()::text
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM board
                WHERE board.id = "column".board_id
                  AND board.owner_id = auth.uid()::text
            )
        )
    """))

    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "column_delete_own"
        ON "column" FOR DELETE
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM board
                WHERE board.id = "column".board_id
                  AND board.owner_id = auth.uid()::text
            )
        )
    """))

    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "column_service_role_all"
        ON "column" FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)
    """))

    # ------------------------------------------------------------------
    # 5. task — access allowed if the parent board belongs to the user
    # ------------------------------------------------------------------
    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "task_select_own"
        ON "task" FOR SELECT
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM board
                WHERE board.id = "task".board_id
                  AND board.owner_id = auth.uid()::text
            )
        )
    """))

    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "task_insert_own"
        ON "task" FOR INSERT
        TO authenticated
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM board
                WHERE board.id = "task".board_id
                  AND board.owner_id = auth.uid()::text
            )
        )
    """))

    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "task_update_own"
        ON "task" FOR UPDATE
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM board
                WHERE board.id = "task".board_id
                  AND board.owner_id = auth.uid()::text
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM board
                WHERE board.id = "task".board_id
                  AND board.owner_id = auth.uid()::text
            )
        )
    """))

    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "task_delete_own"
        ON "task" FOR DELETE
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM board
                WHERE board.id = "task".board_id
                  AND board.owner_id = auth.uid()::text
            )
        )
    """))

    conn.execute(__import__("sqlalchemy").text("""
        CREATE POLICY "task_service_role_all"
        ON "task" FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)
    """))


def downgrade() -> None:
    conn = op.get_bind()
    import sqlalchemy as sa

    policies = {
        "board": [
            "board_select_own", "board_insert_own",
            "board_update_own", "board_delete_own",
            "board_service_role_all",
        ],
        "column": [
            "column_select_own", "column_insert_own",
            "column_update_own", "column_delete_own",
            "column_service_role_all",
        ],
        "task": [
            "task_select_own", "task_insert_own",
            "task_update_own", "task_delete_own",
            "task_service_role_all",
        ],
    }

    for table, names in policies.items():
        for policy in names:
            conn.execute(sa.text(f'DROP POLICY IF EXISTS "{policy}" ON "{table}"'))

    for table in ("task", "column", "board"):
        conn.execute(sa.text(f'ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY'))
        conn.execute(sa.text(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY'))
