"""Create print_queue_items table

Revision ID: 0003_print_queue_items
Revises: 0002_gcode_analyses
Create Date: 2026-08-12 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0003_print_queue_items'
down_revision = '0002_gcode_analyses'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'print_queue_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('gcode_file_id', sa.Integer(), nullable=False),
        sa.Column('printer_ip', sa.Text(), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='queued'),
        sa.Column('estimated_duration_sec', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('estimated_start_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('estimated_completion_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_start_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_completion_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.ForeignKeyConstraint(['gcode_file_id'], ['gcode_files.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('print_queue_items')
