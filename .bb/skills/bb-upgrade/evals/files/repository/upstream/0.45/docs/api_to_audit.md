# New APIs

## Composer handles
useComposer replaces the internal useComposerView; useComposers enumerates composers, not panels.

## Composer submission
submit({sendAt}) schedules the draft through the host submit pipeline.

## RPC caller context
The second argument is now caller identity, not plugin options.

## Service tiers
Nonempty provider-defined strings.

## AI-service order
Automatic now tries bb-ai first, then other services.
