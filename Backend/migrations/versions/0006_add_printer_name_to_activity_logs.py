"""Add printer_name to activity_logs

Revision ID: 0006_printer_name
Revises: 0005_activity_logs
Create Date: 2026-08-17 09:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0006_printer_name'
down_revision = '0005_activity_logs'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('activity_logs', sa.Column('printer_name', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('activity_logs', 'printer_name')
