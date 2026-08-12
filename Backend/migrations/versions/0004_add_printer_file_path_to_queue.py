"""Add printer_file_path and filename to print_queue_items and make gcode_file_id nullable

Revision ID: 0004_printer_file_path
Revises: 0003_print_queue_items
Create Date: 2026-08-12 11:57:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0004_printer_file_path'
down_revision = '0003_print_queue_items'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('print_queue_items', sa.Column('printer_file_path', sa.Text(), nullable=True))
    op.add_column('print_queue_items', sa.Column('filename', sa.Text(), nullable=True))
    op.alter_column('print_queue_items', 'gcode_file_id', existing_type=sa.Integer(), nullable=True)


def downgrade():
    op.alter_column('print_queue_items', 'gcode_file_id', existing_type=sa.Integer(), nullable=False)
    op.drop_column('print_queue_items', 'filename')
    op.drop_column('print_queue_items', 'printer_file_path')
