"""023 Sales: an order counts what was shipped (`ShipmentDispatched`) and is DELIVERED once all of it left (FE-33)."""

import sqlalchemy as sa
from alembic import op

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None

NAME = "ck_orders_status"


def upgrade() -> None:
    op.add_column("orders", sa.Column("quantity_shipped", sa.Numeric, nullable=False, server_default="0"),
                  schema="sales_agent")
    op.create_check_constraint("ck_orders_quantity_shipped", "orders", "quantity_shipped >= 0", schema="sales_agent")
    op.drop_constraint(NAME, "orders", schema="sales_agent", type_="check")
    op.create_check_constraint(NAME, "orders", "status IN ('CONFIRMED', 'CANCELLED', 'DELIVERED')",
                               schema="sales_agent")


def downgrade() -> None:
    op.execute("UPDATE sales_agent.orders SET status = 'CONFIRMED' WHERE status = 'DELIVERED'")
    op.drop_constraint(NAME, "orders", schema="sales_agent", type_="check")
    op.create_check_constraint(NAME, "orders", "status IN ('CONFIRMED', 'CANCELLED')", schema="sales_agent")
    op.drop_constraint("ck_orders_quantity_shipped", "orders", schema="sales_agent", type_="check")
    op.drop_column("orders", "quantity_shipped", schema="sales_agent")
