# lib/city

The City's pure logic (no React, no Three.js), so it can be tested in plain Node (`npm test`, FE-48). The scene and UI
use it; nothing here reads the network or decides anything.

| File | Purpose |
| --- | --- |
| `cityLayout.ts` | The layout as a function of the customer count: neighbourhood blocks and houses (growth rule FE-46), growing fences, roads, supplier plots and gate, the route from a house to Sales. |
| `roads.ts` | The roads as a graph and the shortest route between two places along them, for anything that travels. |
| `customerWalks.ts` | When a customer's owner walks to Sales: new inquiries from the rise of a count, merging, batch timing (FE-18), position along a route, the walking pace everyone on foot shares (8 m/s); `?customers=N` preview houses for fps. |
| `activity.ts` | One feed line per timeline item (tone, place in the City; the key includes a payload fingerprint, so two events of one type saved together stay two lines), the feed filter, which lines are new (toasts, FE-39), order-tracking stage. |
| `detail.ts` | What a clicked element shows, read only from the live snapshot (FE-30); the newest events for the Town Square board. |
| `siteRules.ts` | What buildings show from the live data: factory line light, trucks at dock doors, delivery pin colours (FE-27), pallet and rack fill, which house names show (FE-32). |
| `planting.ts` | Where plants and street lamps stand: campus planting inside the fence (oak clusters on the open land and along the fence, few street trees, tree-free park lawns edged by one continuous hedge, bushes and flowers; kept off roads and kerbs), nothing outside the fence for now and nothing within 25 m of the customer neighbourhood (FE-42), seeded (any whole-number seed, negative too); where grass tufts grow (`grassGround`: the meadow outside the main city, not roads or paved ground); each lamp's heading over its nearest road. |
| `connection.ts` | The connection banner's wording: connecting, live, or offline with the age of the picture shown. |
| `sites.ts` | The Sites of the switcher (FE-34) and where each agent's office stands. |
| `yard.ts` | Where things stand on the warehouse and factory Sites (dock doors, racks, pallets, lines, charging bay) and the yard roads joined to the City roads; the scene draws there and the trips drive there. |
| `forklifts.ts` | Live forklifts and dock trucks (FE-52): the trip of each real Warehouse event (from, to, the goods from its payload), one poll's trips planned on three forklifts within about 15 s, where a forklift or truck is at a moment. |
| `messengers.ts` | Negotiation messengers (FE-23): office to office out through the plot gates and along the roads, one poll's messages one after another. |
| `eventVisits.ts` | Event visits: a delivered event's subscribers walk to the nearest park's round lawn, read it there facing the Town Square board (4 s), visit the publisher's office (3 s), walk home; once per agent per poll, queued while it is out. |
| `timeOfDay.ts` | Time-of-day modes and their light presets (FE-20, FE-24), including whether the street lamps are on (FE-53); Auto follows the viewer's clock. |

Each `*.test.ts` beside a file tests its rules.
