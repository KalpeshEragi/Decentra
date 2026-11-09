"""Sales follows other agents' events about its orders (pubsub catalogue):
- `PlanRevised`: when Planning has decided on a customer's quantity change, the confirmed order shows the quantity
  Planning now commits. Sales only repeats Planning's validated result; it never decides the quantity itself.
- `ShipmentDispatched`: the Warehouse shipped goods of an order. Sales counts them; once the whole order has left, the
  order is DELIVERED (the customer-facing status Sales owns), and a customer in a chat is told what shipped. Simulated
  customers have no chat (DM-7)."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.events import channel
from app.events.models import Event
from app.planning_agent import reads as planning_reads
from app.sales_agent import data_access, planning
from app.sales_agent.models import Conversation, EventVersion, Order, Product

AGENT = channel.SALES
# PlanRevised reasons that answer a customer's quantity change (planning_agent/manager.py, S7)
QUANTITY_CHANGED = ("QUANTITY_INCREASED", "QUANTITY_DECREASED", "QUANTITY_DECREASED_DAMPENED")


def on_plan_revised(db: Session, event: Event) -> None:
    """Planning decided on a customer's quantity change: update the order's quantity (or note that the change was
    refused). Other revisions (repairs, cancellations, completion) do not change what the customer ordered."""
    reason, number = event.payload.get("reason"), event.payload.get("order_number")
    if reason not in (*QUANTITY_CHANGED, "CHANGE_REJECTED") or not number:
        return  # other revisions (repairs, cancellations, completion) do not change what the customer ordered
    if not channel.is_newer(db, EventVersion, event):
        return
    order = db.scalar(select(Order).where(Order.order_number == number).with_for_update())
    if order is None or order.status != "CONFIRMED":
        return
    inquiry = data_access.get_inquiry(db, order.inquiry_id)
    if reason in QUANTITY_CHANGED:
        order.quantity = Decimal(str(event.payload["quantity"]))
    data_access.save_audit_note(db, "SYSTEM", "ORDER_CHANGE_REJECTED" if reason == "CHANGE_REJECTED"
                                else "ORDER_QUANTITY_CHANGED",
                                {"order_number": number, "quantity": str(order.quantity), "reason": reason},
                                conversation_id=inquiry.conversation_id, inquiry_id=inquiry.id)


def on_shipment(db: Session, event: Event) -> None:
    """Goods of an order left the factory: add them to the order's shipped quantity; when all of it is shipped the
    order is DELIVERED. The event names Planning's demand; Planning's read module gives its Sales order number. The
    chat message is saved with the order change, so a repeated event (ignored above) cannot send it twice."""
    if not channel.is_newer(db, EventVersion, event):
        return
    plan = planning_reads.get_order_plan(db, event.payload["order_ref"])
    if plan is None or not plan["order_number"]:
        return  # not a Sales customer order
    order = db.scalar(select(Order).where(Order.order_number == plan["order_number"]).with_for_update())
    if order is None or order.status != "CONFIRMED":
        return
    shipped = Decimal(str(event.payload["quantity"]))
    order.quantity_shipped += shipped
    if order.quantity_shipped >= order.quantity:
        order.status = "DELIVERED"
    inquiry = data_access.get_inquiry(db, order.inquiry_id)
    data_access.save_audit_note(db, "SYSTEM", "ORDER_DELIVERED" if order.status == "DELIVERED" else "ORDER_SHIPPED",
                                {"order_number": order.order_number, "shipped": event.payload["quantity"],
                                 "quantity_shipped": str(order.quantity_shipped), "date": event.payload["date"]},
                                conversation_id=inquiry.conversation_id, inquiry_id=inquiry.id)
    if db.get(Conversation, inquiry.conversation_id).channel != "SIMULATED":
        data_access.save_message(db, inquiry.conversation_id, "OUT", planning.shipped_reply(
            order.order_number, shipped, order.quantity_shipped, order.quantity, db.get(Product, order.product_id).name,
            event.payload["date"]), delivery_status="SENT")


def register(runner_register) -> None:
    channel.subscribe(AGENT, "PlanRevised", on_plan_revised)
    channel.subscribe(AGENT, "ShipmentDispatched", on_shipment)
