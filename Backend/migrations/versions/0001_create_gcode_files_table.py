"""Create gcode_files table

Revision ID: 0001_initial
Revises: 
Create Date: 2026-08-12 10:05:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'gcode_files',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('folder_name', sa.Text(), nullable=False),
        sa.Column('size_folder', sa.Text(), nullable=False),
        sa.Column('filename', sa.Text(), nullable=False),
        sa.Column('storage_path', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('storage_path')
    )


def downgrade():
    op.drop_table('gcode_files')
