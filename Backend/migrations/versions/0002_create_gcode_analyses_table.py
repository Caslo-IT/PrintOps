"""Create gcode_analyses table

Revision ID: 0002_gcode_analyses
Revises: 0001_initial
Create Date: 2026-08-12 10:35:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0002_gcode_analyses'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'gcode_analyses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('gcode_file_id', sa.Integer(), nullable=False),
        sa.Column('total_time_sec', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('total_filament_mm', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('total_weight_g', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('filament_diameter_mm', sa.Float(), nullable=False, server_default='1.75'),
        sa.Column('filament_density_g_cm3', sa.Float(), nullable=False, server_default='1.10'),
        sa.Column('layer_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('layer_stats', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.ForeignKeyConstraint(['gcode_file_id'], ['gcode_files.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('gcode_file_id')
    )


def downgrade():
    op.drop_table('gcode_analyses')
