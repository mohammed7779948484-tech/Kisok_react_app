# KISOK Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

Customers browse and submit an in-store order on a shared tablet while standing at arm's length. Preparation employees use the same tablet application to scan active orders and move them through fulfilment quickly and accurately.

## Product Purpose

KISOK is a private in-store catalog and ordering system. It supports product discovery, generic variant selection, a durable local cart, one reliable order submission, and a preparation workflow from new to ready or cancelled.

## Positioning

One tablet application provides a calm retail discovery experience and a denser operational preparation workspace while preserving strict local-cart, checkout-idempotency, recovery, and role-isolation guarantees.

## Operating Context

Store-owned Android tablets are used in portrait and landscape, often while standing and under bright retail lighting. The customer journey is shared between successive customers, so successful checkout must communicate completion clearly and reset safely. Preparation work prioritizes rapid scanning, obvious status, and confident transitions.

## Capabilities and Constraints

- No prices, payments, delivery, shipping, public signup, catalog editing, or outside-store ordering.
- Customer catalog data comes from the existing customer-safe snapshot; exact stock quantities and customer order tracking are unavailable.
- Product options are generic product variants, not flavors.
- Existing authentication, Supabase, query, state, cart persistence, checkout recovery, idempotency, assignment, cancellation, inventory, and Realtime semantics must remain unchanged.
- Expo, React Native, Expo Router, NativeWind, TanStack Query, and Zustand remain the platform baseline.

## Brand Commitments

The product name is KISOK. Interface language is direct, calm, and operationally precise. No existing palette or visual treatment is a brand requirement.

## Evidence on Hand

The repository contains the complete implemented customer and preparation journeys, current product imagery URLs supplied by the catalog, and a source-level UI Lab. No additional brand assets or unsupported merchandising, inventory, SLA, priority, or tracking data may be fabricated.

## Product Principles

- Make touch interaction obvious and comfortable on a shared tablet.
- Give product imagery and customer decisions visual confidence without adding financial UI.
- Make preparation state and actions scannable without turning the customer experience into a dashboard.
- Communicate uncertain, blocked, and destructive states honestly.
- Preserve correctness-sensitive behavior while allowing the presentation layer to be reinvented.

## Accessibility & Inclusion

Interactive targets remain at least 48dp, text must scale without clipping, state cannot rely on color alone, controls need accessible names and roles, and contrast must remain readable at arm's length.
