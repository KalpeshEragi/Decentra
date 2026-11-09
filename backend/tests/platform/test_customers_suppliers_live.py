"""FE-33: the observer's live snapshot lists every customer (creation order, has an open order) and every supplier
(creation order). A Sales order is open until Sales marks it DELIVERED from the Warehouse's `ShipmentDispatched`."""

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.events import channel
from app.planning_agent.models import CustomerDemand
from app.sales_agent import models as sales
from app.sales_agent import plan_events
from app.sales_agent import reads as sales_reads
from app.supplier_service.models import Supplier

DAY = date(2026, 11, 3)
T0 = datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc)


def _customer_with_order(db, phone: str, name: str, created_at: datetime, order_number: str, quantity: int,
                         chat_channel: str = "SIMULATED"):
    """A customer with one confirmed order of `quantity`, and Planning's demand for it. Returns the demand id."""
    customer = sales.Customer(phone=phone, name=name, created_at=created_at)
    product = db.scalar(select(sales.Product).where(sales.Product.sku == "P-1"))
    if product is None:
        product = sales.Product(sku="P-1", name="Phone")
        db.add(product)
    db.add(customer)
    db.flush()
    conversation = sales.Conversation(customer_id=customer.id, channel=chat_channel, sender_ref=phone)
    db.add(conversation)
    db.flush()
    inquiry = sales.Inquiry(conversation_id=conversation.id, customer_id=customer.id, stage="CONFIRMED",
                            product_id=product.id, quantity=quantity, requested_date=DAY)
    db.add(inquiry)
    db.flush()
    option = sales.Option(inquiry_id=inquiry.id, kind="REQUESTED", quantity=quantity, delivery_date=DAY,
                          status="SELECTED")
    db.add(option)
    db.flush()
    db.add(sales.Order(order_number=order_number, customer_id=customer.id, inquiry_id=inquiry.id, option_id=option.id,
                       product_id=product.id, quantity=quantity, delivery_date=DAY, confirmed_at=created_at))
    demand = CustomerDemand(request_ref=f"REQ-{order_number}", sales_inquiry_id=str(inquiry.id),
                            sales_order_number=order_number, item_id=str(uuid.uuid4()), quantity=quantity,
                            requested_day=DAY, order_day=DAY, committed_quantity=quantity, committed_day=DAY,
                            status="COMMITTED", request_payload={})
    db.add(demand)
    db.flush()
    return str(demand.id)


def _ship(db, demand_id: str, quantity: int, day: date):
    """The Warehouse's fact, handled by Sales as the event channel would deliver it."""
    event = channel.publish(db, event_type="ShipmentDispatched", publisher=channel.WAREHOUSE, entity_type="order",
                            entity_id=demand_id, entity_version=day.toordinal(), correlation_id="test",
                            payload={"order_ref": demand_id, "item_id": "x", "quantity": str(quantity),
                                     "date": day.isoformat()})
    plan_events.on_shipment(db, event)
    return event


def _order(db, number: str) -> sales.Order:
    db.expire_all()
    return db.scalar(select(sales.Order).where(sales.Order.order_number == number))


def test_an_order_is_delivered_only_when_all_of_it_has_shipped_and_a_repeat_delivery_counts_once(session_factory):
    with session_factory() as db:
        demand = _customer_with_order(db, "+1", "Alpha", T0, "SO-1", 100)
        first = _ship(db, demand, 60, DAY)
        assert (_order(db, "SO-1").status, _order(db, "SO-1").quantity_shipped) == ("CONFIRMED", 60)

        plan_events.on_shipment(db, first)  # the same event delivered again: ignored (EV-4)
        assert _order(db, "SO-1").quantity_shipped == 60

        _ship(db, demand, 40, DAY + timedelta(days=1))
        assert (_order(db, "SO-1").status, _order(db, "SO-1").quantity_shipped) == ("DELIVERED", 100)


def _told(db) -> list[str]:
    return list(db.scalars(select(sales.Message.text).where(sales.Message.direction == "OUT")
                           .order_by(sales.Message.created_at)))


def test_a_chat_customer_is_told_each_shipment_once_and_a_simulated_customer_gets_no_chat(session_factory):
    with session_factory() as db:
        demand = _customer_with_order(db, "+1", "Alpha", T0, "SO-1", 100, chat_channel="TEST")
        first = _ship(db, demand, 60, DAY)
        plan_events.on_shipment(db, first)  # a repeat delivery tells nobody twice
        _ship(db, demand, 40, DAY + timedelta(days=1))
        assert _told(db) == [
            "Part of your order SO-1 has shipped: 60 x Phone left our factory on 2026-11-03. "
            "So far 60 of 100 have shipped; the rest is still to come.",
            "Your order SO-1 has shipped in full: 100 x Phone. The last goods left our factory on 2026-11-04."]

        simulated = _customer_with_order(db, "+2", "Bravo", T0, "SO-2", 10)
        _ship(db, simulated, 10, DAY)
        assert _order(db, "SO-2").status == "DELIVERED"
        assert len(_told(db)) == 2


def test_an_inquiry_counts_for_its_customer_through_the_conversation(session_factory):
    """A first-time customer's inquiries have no customer of their own; the conversation links them."""
    with session_factory() as db:
        _customer_with_order(db, "+1", "Alpha", T0, "SO-1", 100)
        conversation = db.scalar(select(sales.Conversation))
        db.add(sales.Inquiry(conversation_id=conversation.id, customer_id=None, stage="GATHERING",
                             created_at=T0 + timedelta(days=9)))
        db.commit()
        found = sales_reads.customers(db)
    assert (found[0]["inquiry_count"], found[0]["latest_inquiry"]["stage"]) == (2, "GATHERING")


def test_live_lists_customers_and_suppliers_in_creation_order_with_open_orders(session_factory, factory):
    with session_factory() as db:
        delivered = _customer_with_order(db, "+2", "Bravo", T0 + timedelta(hours=1), "SO-2", 10)
        _customer_with_order(db, "+1", "Alpha", T0, "SO-1", 10)  # created earlier, saved later
        db.add(sales.Customer(phone="+3", name=None, created_at=T0 + timedelta(hours=2)))  # no order yet
        _ship(db, delivered, 10, DAY)
        db.add_all([Supplier(name="Zeta Metals", created_at=T0), Supplier(name="Beta Parts", created_at=T0),
                    Supplier(name="AAA Late Supplier", created_at=T0 + timedelta(days=1))])  # added last
        db.commit()

    live = factory["client"].get("/observer/live").json()

    assert [(c["label"], c["has_open_order"]) for c in live["customers"]] == [
        ("Alpha", True), ("Bravo", False), ("Customer 3", False)]  # creation order; delivered = no longer open
    alpha = live["customers"][0]
    assert (alpha["open_orders"], alpha["inquiry_count"]) == (["SO-1"], 1)
    assert (alpha["latest_inquiry"]["stage"], alpha["latest_inquiry"]["product"], alpha["latest_inquiry"]["quantity"]) == (
        "CONFIRMED", "Phone", "10")
    assert (live["customers"][2]["inquiry_count"], live["customers"][2]["latest_inquiry"]) == (0, None)
    assert [s["name"] for s in live["suppliers"]] == [  # creation order, ties by name: a new supplier never
        "Beta Parts", "Zeta Metals", "AAA Late Supplier"]  # moves the others' depots
