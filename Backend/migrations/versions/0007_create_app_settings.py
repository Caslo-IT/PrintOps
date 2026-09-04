"""create persistent application settings

Revision ID: 0007_app_settings
Revises: d543239eaae5
Create Date: 2026-09-04 10:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_app_settings"
down_revision = "d543239eaae5"
branch_labels = None
depends_on = None


def upgrade():
    # Some existing deployments create ORM tables at runtime with
    # ``db.create_all()``. Do not fail their first formal migration merely
    # because this table already exists; Alembic will still record the revision.
    if not sa.inspect(op.get_bind()).has_table("app_settings"):
        op.create_table(
            "app_settings",
            sa.Column("key", sa.String(length=100), nullable=False),
            sa.Column("value", sa.Text(), nullable=False),
            sa.PrimaryKeyConstraint("key"),
        )


def downgrade():
    if sa.inspect(op.get_bind()).has_table("app_settings"):
        op.drop_table("app_settings")
