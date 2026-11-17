"""013 Sales: the channel `SIMULATED` for structured simulated customers (DM-7, step 7)."""

from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None

NAME = "ck_conversations_channel"


def upgrade() -> None:
    op.drop_constraint(NAME, "conversations", schema="sales_agent", type_="check")
    op.create_check_constraint(NAME, "conversations", "channel IN ('TEST', 'WHATSAPP', 'SIMULATED')",
                               schema="sales_agent")


SIMULATED = "SELECT id FROM sales_agent.conversations WHERE channel = 'SIMULATED'"
SIMULATED_INQUIRIES = f"SELECT id FROM sales_agent.inquiries WHERE conversation_id IN ({SIMULATED})"


def downgrade() -> None:
    # Remove the simulated customers' data before their conversations: children first, circular links cleared first
    for statement in (
        f"UPDATE sales_agent.conversations SET current_inquiry_id = NULL WHERE id IN ({SIMULATED})",
        f"UPDATE sales_agent.inquiries SET selected_option_id = NULL, confirmation_message_id = NULL "
        f"WHERE id IN ({SIMULATED_INQUIRIES})",
        f"DELETE FROM sales_agent.orders WHERE inquiry_id IN ({SIMULATED_INQUIRIES})",
        f"DELETE FROM sales_agent.customer_memory WHERE inquiry_id IN ({SIMULATED_INQUIRIES})",
        f"DELETE FROM sales_agent.audit_log WHERE conversation_id IN ({SIMULATED}) "
        f"OR inquiry_id IN ({SIMULATED_INQUIRIES})",
        f"DELETE FROM sales_agent.options WHERE inquiry_id IN ({SIMULATED_INQUIRIES})",
        f"DELETE FROM sales_agent.inquiries WHERE conversation_id IN ({SIMULATED})",
        f"DELETE FROM sales_agent.messages WHERE conversation_id IN ({SIMULATED})",
        "DELETE FROM sales_agent.conversations WHERE channel = 'SIMULATED'",
    ):
        op.execute(statement)
    op.drop_constraint(NAME, "conversations", schema="sales_agent", type_="check")
    op.create_check_constraint(NAME, "conversations", "channel IN ('TEST', 'WHATSAPP')", schema="sales_agent")
