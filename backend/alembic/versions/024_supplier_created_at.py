"""024 Supplier Service: suppliers get a creation time, so the City can give out depot plots in a stable order
(FE-27, FE-33, FE-44). Existing suppliers all get the migration time; ties are ordered by name."""

import sqlalchemy as sa
from alembic import op

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("suppliers", sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                                         server_default=sa.func.now()), schema="supplier_service")


def downgrade() -> None:
    op.drop_column("suppliers", "created_at", schema="supplier_service")
